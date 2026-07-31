import "dotenv/config";
import { randomUUID } from "node:crypto";
import {
  SYSTEM_ACTOR_ID,
  applyTenantContext,
  getSystemRoleId,
  prisma,
  runTransaction,
} from "@pathway/db";
import { AuditAction, AuditEntityType } from "../src/audit/audit.types";
import { recordAuditEventInTransaction } from "../src/audit/audit.service";
import { OutboxService } from "../src/common/outbox/outbox.service";

const apply = process.argv.includes("--apply");
const outbox = new OutboxService();

type BackfillResult = {
  orgsScanned: number;
  orgsSkippedNoTemplate: number;
  assignmentsCreated: number;
  assignmentsAlreadyGranted: number;
};

/**
 * ACE-F14 removes the legacy ORG_ADMIN route bootstrap, but no
 * UserRoleAssignment rows exist yet for the org admins that bootstrap
 * currently authorises - see docs/ace-vertical/runbooks/access-recovery.md,
 * which is explicit that legacy ORG_ADMIN satisfies neither the last-head
 * nor self-lockout invariant. This grants each existing active ORG_ADMIN an
 * active assignment to their org's already-seeded "Organisation Head"
 * system role, so the cutover doesn't lock any organisation out of access
 * administration. Requires `pnpm db:seed` to have run first (skips orgs
 * whose system role isn't seeded yet, rather than creating one - only the
 * pathway_system_role_seed login may do that).
 */
async function main(): Promise<void> {
  console.log(
    `[access-backfill] mode=${apply ? "apply" : "dry-run"}; pass --apply to grant existing legacy ORG_ADMINs an active Organisation Head assignment.`,
  );

  const result: BackfillResult = {
    orgsScanned: 0,
    orgsSkippedNoTemplate: 0,
    assignmentsCreated: 0,
    assignmentsAlreadyGranted: 0,
  };

  const orgs = await prisma.org.findMany({
    select: { id: true },
    orderBy: { id: "asc" },
  });

  for (const org of orgs) {
    result.orgsScanned += 1;
    const roleDefinitionId = getSystemRoleId(org.id, null, "organisationHead");
    const role = await prisma.orgRoleDefinition.findUnique({
      where: { id: roleDefinitionId },
      select: { isActive: true, isSystem: true },
    });

    if (!role || !role.isActive || !role.isSystem) {
      result.orgsSkippedNoTemplate += 1;
      console.log(`[access-backfill] SKIPPED_NO_TEMPLATE org=${org.id}`);
      continue;
    }

    const admins = await prisma.orgMembership.findMany({
      where: { orgId: org.id, role: "ORG_ADMIN" },
      select: { userId: true },
    });

    for (const admin of admins) {
      const now = new Date();
      const existing = await prisma.userRoleAssignment.findFirst({
        where: {
          orgId: org.id,
          userId: admin.userId,
          roleDefinitionId,
          revokedAt: null,
          startsAt: { lte: now },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: { id: true },
      });

      if (existing) {
        result.assignmentsAlreadyGranted += 1;
        continue;
      }

      if (!apply) {
        console.log(
          `[access-backfill] WOULD_CREATE org=${org.id} user=${admin.userId}`,
        );
        continue;
      }

      const assignmentId = randomUUID();
      await runTransaction(async (tx) => {
        await applyTenantContext(tx, "", org.id);
        await tx.userRoleAssignment.create({
          data: {
            id: assignmentId,
            orgId: org.id,
            tenantId: null,
            userId: admin.userId,
            roleDefinitionId,
            assignedById: SYSTEM_ACTOR_ID,
            startsAt: now,
          },
        });
        await recordAuditEventInTransaction(tx, {
          actorUserId: SYSTEM_ACTOR_ID,
          orgId: org.id,
          entityType: AuditEntityType.ROLE_ASSIGNMENT,
          entityId: assignmentId,
          action: AuditAction.ASSIGNMENT_CREATED,
          metadata: {
            source: "ACE-F14 legacy ORG_ADMIN backfill",
            legacyMembershipRole: "ORG_ADMIN",
            roleDefinitionId,
            userId: admin.userId,
          },
        });
        await outbox.enqueue(tx, {
          aggregateType: "user-access",
          aggregateId: admin.userId,
          eventType: "access.assignment.changed",
          payload: {
            action: "assigned",
            assignmentId,
            orgId: org.id,
            tenantId: null,
            requestId: `ace-f14-backfill:${org.id}:${admin.userId}`,
          },
          idempotencyKey: `access-assignment:ace-f14-backfill:${org.id}:${admin.userId}`,
        });
      });

      result.assignmentsCreated += 1;
      console.log(
        `[access-backfill] CREATED org=${org.id} user=${admin.userId} assignment=${assignmentId}`,
      );
    }
  }

  console.log(JSON.stringify(result, null, 2));
}

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
