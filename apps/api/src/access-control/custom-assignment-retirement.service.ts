import { applyTenantContext, type Prisma } from "@pathway/db";
import { OutboxService } from "../common/outbox/outbox.service";
import { AccessCacheService } from "./access-cache.service";
import { assertFixedOrganisationHead } from "./access-tags.delegation";
import { CutoverPreviewError } from "./custom-assignment-parity-error";
import { planSchema, validateMappings } from "./custom-assignment-parity-plan";
import {
  readCustomAssignmentInventory,
  readCustomAssignmentInventoryInTransaction,
} from "./custom-assignment-parity-reader";
import { CustomAssignmentRetirementWriter } from "./custom-assignment-retirement-writer";
import { EffectivePermissionsService } from "./effective-permissions.service";
import { RoleSafetyService } from "./role-safety.service";
import {
  rolesTransactionBoundary,
  type RoleActorContext,
  type RolesTransactionBoundary,
} from "./roles.service";
import type { z } from "zod";

type CutoverPlan = z.infer<typeof planSchema>;
type Mapping = CutoverPlan["mappings"][number];

export interface RetiredUserResult {
  userId: string;
  assignmentCount: number;
  createdRoleAssignments: number;
  createdTagGrants: number;
  contextCount: number;
}

/** Maintenance-only cutover. Every user commits independently and must pass live parity. */
export class CustomAssignmentRetirementService {
  constructor(
    private readonly permissions: EffectivePermissionsService,
    private readonly roleSafety: RoleSafetyService,
    private readonly outbox: OutboxService,
    private readonly cache: AccessCacheService,
    private readonly transaction: RolesTransactionBoundary = rolesTransactionBoundary,
  ) {}

  async retire(
    plan: CutoverPlan,
    actor: RoleActorContext,
    onCommitted?: (result: RetiredUserResult) => void,
  ): Promise<RetiredUserResult[]> {
    if (actor.orgId !== plan.orgId || actor.tenantId) {
      throw new CutoverPreviewError("Cutover requires organisation scope");
    }
    await this.transaction.run(actor, (tx) =>
      assertFixedOrganisationHead(tx, actor, new Date()),
    );
    const initial = await readCustomAssignmentInventory(plan.orgId, new Date());
    const validated = validateMappings(plan.mappings, initial);
    if (validated.uncovered.length > 0) {
      throw new CutoverPreviewError("Plan leaves legacy permissions uncovered");
    }

    const initialAssignments = new Map(
      initial.assignments.map((assignment) => [assignment.id, assignment]),
    );
    const byUser = new Map<string, Mapping[]>();
    for (const mapping of plan.mappings) {
      const assignment = initialAssignments.get(mapping.assignmentId);
      if (!assignment)
        throw new CutoverPreviewError("Assignment changed after inventory");
      const entries = byUser.get(assignment.userId) ?? [];
      entries.push(mapping);
      byUser.set(assignment.userId, entries);
    }

    const completed: RetiredUserResult[] = [];
    for (const [userId, mappings] of [...byUser].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const result = await this.transaction.run(actor, async (tx) =>
        this.retireUser(tx, actor, userId, mappings),
      );
      completed.push(result);
      try {
        onCommitted?.(result);
      } finally {
        await this.cache.invalidateUser(userId, actor.orgId);
      }
    }
    const remaining = await readCustomAssignmentInventory(
      plan.orgId,
      new Date(),
    );
    if (remaining.assignments.length > 0) {
      throw new CutoverPreviewError(
        "New or unprocessed custom assignments remain; run a fresh inventory",
      );
    }
    return completed;
  }

  private async retireUser(
    tx: Prisma.TransactionClient,
    actor: RoleActorContext,
    userId: string,
    mappings: readonly Mapping[],
  ): Promise<RetiredUserResult> {
    const now = new Date();
    const inventory = await readCustomAssignmentInventoryInTransaction(
      actor.orgId,
      now,
      tx,
      userId,
    );
    const { uncovered } = validateMappings(mappings, inventory);
    if (uncovered.length > 0) {
      throw new CutoverPreviewError(`Uncovered permissions for user ${userId}`);
    }
    await assertFixedOrganisationHead(tx, actor, now);
    const before = await this.readAccessByScope(
      tx,
      actor.orgId,
      userId,
      inventory.siteIds,
      now,
    );
    const result: RetiredUserResult = {
      userId,
      assignmentCount: inventory.assignments.length,
      createdRoleAssignments: 0,
      createdTagGrants: 0,
      contextCount: before.size,
    };
    const assignments = new Map(
      inventory.assignments.map((assignment) => [assignment.id, assignment]),
    );

    await applyTenantContext(tx, "", actor.orgId);
    const writer = new CustomAssignmentRetirementWriter(this.outbox);
    await this.roleSafety.assertHeadAndSelfLockoutSafe({
      tx,
      actorUserId: actor.userId,
      orgId: actor.orgId,
      requestId: actor.requestId,
      mutate: async () => {
        for (const mapping of mappings) {
          const source = assignments.get(mapping.assignmentId);
          if (!source)
            throw new CutoverPreviewError("Assignment changed during cutover");
          for (const fixedRoleId of mapping.fixedRoleIds) {
            if (
              await writer.createFixedRoleAssignment(
                tx,
                actor,
                source,
                fixedRoleId,
              )
            ) {
              result.createdRoleAssignments += 1;
            }
          }
          for (const tagKey of mapping.tagKeys) {
            if (await writer.createTagGrant(tx, actor, source, tagKey, now)) {
              result.createdTagGrants += 1;
            }
          }
          await writer.revokeCustomAssignment(tx, actor, source, now);
        }
      },
    });

    const after = await this.readAccessByScope(
      tx,
      actor.orgId,
      userId,
      inventory.siteIds,
      now,
    );
    for (const [scope, keys] of before) {
      if (JSON.stringify(keys) !== JSON.stringify(after.get(scope))) {
        throw new CutoverPreviewError(
          `Effective access changed for user ${userId} at ${scope}`,
        );
      }
    }
    return result;
  }

  private async readAccessByScope(
    tx: Prisma.TransactionClient,
    orgId: string,
    userId: string,
    siteIds: readonly string[],
    now: Date,
  ): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
    for (const tenantId of [undefined, ...siteIds]) {
      const permissions =
        await this.permissions.listForUserWithSourcesInTransaction(
          userId,
          orgId,
          tenantId,
          now,
          tx,
        );
      result.set(
        tenantId ?? "organisation",
        permissions.map(({ permissionKey }) => permissionKey).sort(),
      );
    }
    return result;
  }
}
