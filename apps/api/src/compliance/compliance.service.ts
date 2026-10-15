import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Inject,
  NotFoundException,
} from "@nestjs/common";
import { withTenantRlsContext, type Prisma } from "@pathway/db";
import type {
  CompliancePeoplePage,
  ComplianceRecordExport,
  CompliancePersonnelRecord,
  ComplianceRecordInput,
  ComplianceRecordKind,
  ComplianceRecordPage,
  ComplianceRevisionPage,
} from "@pathway/types";
import {
  complianceWriteValues,
  recordComplianceRevision,
} from "./compliance-mutations";
import {
  complianceSiteUsers,
  listComplianceRecords,
  findCompliancePeople,
} from "./compliance-queries";
import { readComplianceHistory } from "./compliance-history";
import { EffectivePermissionsService } from "../access-control/effective-permissions.service";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import { serializeComplianceRecord } from "./compliance-record";

export interface ComplianceActor {
  tenantId: string;
  orgId: string;
  userId: string;
}
export interface ComplianceListQuery {
  cursor?: string;
  kind?: ComplianceRecordKind;
  includeArchived?: boolean;
}
const scope = (actor: ComplianceActor) => ({
  tenantId: actor.tenantId,
  orgId: actor.orgId,
});

@Injectable()
export class ComplianceService {
  constructor(
    @Inject(EffectivePermissionsService)
    private readonly permissions: EffectivePermissionsService,
  ) {}

  private async run<T>(
    actor: ComplianceActor,
    manage: boolean,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (
      !actor.userId?.trim() ||
      !actor.orgId?.trim() ||
      !actor.tenantId?.trim()
    ) {
      throw new BadRequestException(
        "An active site and authenticated user are required",
      );
    }
    const decision = await this.permissions.resolve({
      ...actor,
      permission: manage
        ? "compliance.checks.manage"
        : "compliance.checks.read",
      now: new Date(),
    });
    if (!decision.allowed)
      throw new ForbiddenException("Compliance register access denied");
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const site = await tx.tenant.findFirst({
        where: { id: actor.tenantId, orgId: actor.orgId },
        select: { id: true },
      });
      if (!site) throw new NotFoundException("Site not found");
      return operation(tx);
    });
  }

  private async find(
    tx: Prisma.TransactionClient,
    id: string,
    actor: ComplianceActor,
  ) {
    const record = await tx.compliancePersonnelRecord.findFirst({
      where: { id, ...scope(actor) },
    });
    if (!record) throw new NotFoundException("Compliance record not found");
    return record;
  }

  private async requireSubject(
    tx: Prisma.TransactionClient,
    subjectUserId: string | null,
    actor: ComplianceActor,
  ): Promise<void> {
    if (!subjectUserId) return;
    const user = await tx.user.findFirst({
      where: {
        id: subjectUserId,
        isActive: true,
        ...complianceSiteUsers(actor.tenantId),
      },
      select: { id: true },
    });
    if (!user)
      throw new NotFoundException("Linked person is not a member of this site");
  }

  private async auditRead(
    tx: Prisma.TransactionClient,
    id: string,
    actor: ComplianceActor,
    view: "record" | "history",
  ): Promise<void> {
    await recordAuditEventInTransaction(tx, {
      ...scope(actor),
      actorUserId: actor.userId,
      entityType: AuditEntityType.COMPLIANCE_PERSONNEL,
      entityId: id,
      action: AuditAction.VIEWED,
      metadata: { view },
    });
  }

  async list(
    query: ComplianceListQuery,
    actor: ComplianceActor,
  ): Promise<ComplianceRecordPage> {
    return this.run(actor, false, async (tx) => {
      const page = await listComplianceRecords(tx, query, actor);
      await recordAuditEventInTransaction(tx, {
        ...scope(actor),
        actorUserId: actor.userId,
        entityType: AuditEntityType.COMPLIANCE_PERSONNEL,
        action: AuditAction.VIEWED,
        metadata: {
          view: "register",
          recordIds: page.items.map((record) => record.id),
        },
      });
      return page;
    });
  }

  async get(
    id: string,
    actor: ComplianceActor,
  ): Promise<CompliancePersonnelRecord> {
    return this.run(actor, false, async (tx) => {
      const record = serializeComplianceRecord(await this.find(tx, id, actor));
      await this.auditRead(tx, id, actor, "record");
      return record;
    });
  }

  async create(
    input: ComplianceRecordInput,
    actor: ComplianceActor,
  ): Promise<CompliancePersonnelRecord> {
    return this.run(actor, true, async (tx) => {
      await this.requireSubject(tx, input.subjectUserId, actor);
      const row = await tx.compliancePersonnelRecord.create({
        data: {
          ...complianceWriteValues(input, actor),
          ...scope(actor),
          createdByUserId: actor.userId,
        },
      });
      const record = serializeComplianceRecord(row);
      await recordComplianceRevision(tx, record, actor, "created");
      return record;
    });
  }

  async update(
    id: string,
    input: ComplianceRecordInput,
    expectedVersion: number,
    actor: ComplianceActor,
  ): Promise<CompliancePersonnelRecord> {
    return this.run(actor, true, async (tx) => {
      const existing = await this.find(tx, id, actor);
      if (existing.archivedAt || existing.version !== expectedVersion)
        throw new ConflictException(
          "This record changed. Reload it before saving.",
        );
      if (input.subjectUserId !== existing.subjectUserId) {
        await this.requireSubject(tx, input.subjectUserId, actor);
      }
      const result = await tx.compliancePersonnelRecord.updateMany({
        where: {
          id,
          ...scope(actor),
          version: expectedVersion,
          archivedAt: null,
        },
        data: {
          ...complianceWriteValues(input, actor),
          version: { increment: 1 },
        },
      });
      if (result.count !== 1)
        throw new ConflictException(
          "This record changed. Reload it before saving.",
        );
      const record = serializeComplianceRecord(await this.find(tx, id, actor));
      await recordComplianceRevision(tx, record, actor, "updated");
      return record;
    });
  }

  async archive(
    id: string,
    expectedVersion: number,
    actor: ComplianceActor,
  ): Promise<CompliancePersonnelRecord> {
    return this.run(actor, true, async (tx) => {
      const existing = await this.find(tx, id, actor);
      if (existing.archivedAt || existing.version !== expectedVersion)
        throw new ConflictException(
          "This record changed. Reload it before archiving.",
        );
      const result = await tx.compliancePersonnelRecord.updateMany({
        where: {
          id,
          ...scope(actor),
          version: expectedVersion,
          archivedAt: null,
        },
        data: {
          archivedAt: new Date(),
          updatedByUserId: actor.userId,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1)
        throw new ConflictException(
          "This record changed. Reload it before archiving.",
        );
      const record = serializeComplianceRecord(await this.find(tx, id, actor));
      await recordComplianceRevision(tx, record, actor, "archived");
      return record;
    });
  }

  async history(
    id: string,
    cursor: string | undefined,
    actor: ComplianceActor,
  ): Promise<ComplianceRevisionPage> {
    return this.run(actor, false, async (tx) => {
      await this.find(tx, id, actor);
      const history = await readComplianceHistory(tx, id, cursor, actor);
      await this.auditRead(tx, id, actor, "history");
      return history;
    });
  }

  async exportRecord(
    id: string,
    cursor: string | undefined,
    actor: ComplianceActor,
  ): Promise<ComplianceRecordExport> {
    return this.run(actor, true, async (tx) => {
      const record = serializeComplianceRecord(await this.find(tx, id, actor));
      const history = await readComplianceHistory(tx, id, cursor, actor);
      const exportedAt = new Date().toISOString();
      await recordAuditEventInTransaction(tx, {
        ...scope(actor),
        actorUserId: actor.userId,
        entityType: AuditEntityType.COMPLIANCE_PERSONNEL,
        entityId: id,
        action: AuditAction.EXPORTED,
        metadata: {
          version: record.version,
          revisionCount: history.items.length,
        },
      });
      return { record, history, exportedAt };
    });
  }

  async people(
    query: string | undefined,
    actor: ComplianceActor,
  ): Promise<CompliancePeoplePage> {
    return this.run(actor, true, (tx) =>
      findCompliancePeople(tx, query, actor),
    );
  }
}
