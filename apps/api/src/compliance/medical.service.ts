import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { withTenantRlsContext, type Prisma } from "@pathway/db";
import type {
  ComplianceMedicalPage,
  ComplianceMedicalRecord,
  ComplianceMedicalUpdate,
} from "@pathway/types";
import { EffectivePermissionsService } from "../access-control/effective-permissions.service";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import type { ComplianceActor } from "./compliance.service";
import {
  medicalSelect,
  medicalStorageValue,
  serializeMedicalRecord,
} from "./medical-record";

const childScope = (actor: ComplianceActor): Prisma.ChildWhereInput => ({
  tenantId: actor.tenantId,
  OR: [{ isGuest: false }, { guestExpiresAt: { gt: new Date() } }],
});

@Injectable()
export class MedicalService {
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
    )
      throw new BadRequestException(
        "An active site and authenticated user are required",
      );
    const decision = await this.permissions.resolve({
      ...actor,
      permission: manage
        ? "compliance.medical.manage"
        : "compliance.medical.read",
      now: new Date(),
    });
    if (!decision.allowed)
      throw new ForbiddenException("Medical information access denied");
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
    const row = await tx.child.findFirst({
      where: { id, ...childScope(actor) },
      select: medicalSelect,
    });
    if (!row) throw new NotFoundException("Medical record not found");
    return row;
  }

  private async audit(
    tx: Prisma.TransactionClient,
    actor: ComplianceActor,
    action: AuditAction,
    recordIds: string[],
    entityId?: string,
  ): Promise<void> {
    await recordAuditEventInTransaction(tx, {
      ...actor,
      actorUserId: actor.userId,
      entityType: AuditEntityType.CHILD_MEDICAL,
      action,
      entityId,
      metadata: { recordIds },
    });
  }

  async list(
    cursor: string | undefined,
    actor: ComplianceActor,
  ): Promise<ComplianceMedicalPage> {
    return this.run(actor, false, async (tx) => {
      if (cursor) await this.find(tx, cursor, actor);
      const rows = await tx.child.findMany({
        where: {
          ...childScope(actor),
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        orderBy: { id: "asc" },
        take: 51,
        select: medicalSelect,
      });
      const items = rows.slice(0, 50).map(serializeMedicalRecord);
      await this.audit(
        tx,
        actor,
        AuditAction.VIEWED,
        items.map((item) => item.id),
      );
      return {
        items,
        nextCursor: rows.length > 50 ? items[items.length - 1].id : null,
      };
    });
  }

  async get(
    id: string,
    actor: ComplianceActor,
  ): Promise<ComplianceMedicalRecord> {
    return this.run(actor, false, async (tx) => {
      const record = serializeMedicalRecord(await this.find(tx, id, actor));
      await this.audit(tx, actor, AuditAction.VIEWED, [id], id);
      return record;
    });
  }

  async exportRecord(
    id: string,
    actor: ComplianceActor,
  ): Promise<{ record: ComplianceMedicalRecord; exportedAt: string }> {
    return this.run(actor, true, async (tx) => {
      const record = serializeMedicalRecord(await this.find(tx, id, actor));
      await this.audit(tx, actor, AuditAction.EXPORTED, [id], id);
      return { record, exportedAt: new Date().toISOString() };
    });
  }

  async update(
    id: string,
    input: ComplianceMedicalUpdate,
    actor: ComplianceActor,
  ): Promise<ComplianceMedicalRecord> {
    return this.run(actor, true, async (tx) => {
      const current = await this.find(tx, id, actor);
      const existing = serializeMedicalRecord(current);
      if (
        [
          existing.allergies,
          existing.medicalConditions,
          existing.medicationAtSite,
        ].some((field) => field.status === "UNAVAILABLE")
      )
        throw new ServiceUnavailableException({
          code: "MEDICAL_INFORMATION_UNAVAILABLE",
          message:
            "Medical information could not be read. Retry or ask an administrator to restore access before saving.",
        });
      const expected = new Date(input.expectedUpdatedAt);
      if (current.updatedAt.getTime() !== expected.getTime())
        throw new ConflictException(
          "This record changed. Reload it before saving.",
        );
      const updatedAt = new Date(
        Math.max(Date.now(), current.updatedAt.getTime() + 1),
      );
      const result = await tx.child.updateMany({
        where: { id, ...childScope(actor), updatedAt: expected },
        data: {
          allergies: medicalStorageValue(input.allergies) ?? "unknown",
          allergiesConfirmedAt:
            input.allergies.status === "UNKNOWN" ? null : updatedAt,
          medicalConditions: medicalStorageValue(input.medicalConditions),
          medicationAtSite: medicalStorageValue(input.medicationAtSite),
          updatedAt,
        },
      });
      if (result.count !== 1)
        throw new ConflictException(
          "This record changed. Reload it before saving.",
        );
      const record = serializeMedicalRecord(await this.find(tx, id, actor));
      await this.audit(tx, actor, AuditAction.UPDATED, [id], id);
      return record;
    });
  }
}
