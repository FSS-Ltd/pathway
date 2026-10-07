import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { withTenantRlsContext, type Prisma } from "@pathway/db";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import type {
  CreateAceSubjectDto,
  DeactivateAceSubjectDto,
  RenameAceSubjectDto,
} from "./dto/ace-subject.dto";

export interface AceSubjectActor {
  tenantId: string;
  orgId: string;
  userId: string;
}

export interface AceSubjectResponse {
  id: string;
  name: string;
  isActive: boolean;
}

const subjectSelect = { id: true, name: true, isActive: true } as const;

@Injectable()
export class AceSubjectsService {
  async list(actor: AceSubjectActor): Promise<AceSubjectResponse[]> {
    this.assertActor(actor);
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await this.requireSite(tx, actor);
      return tx.subject.findMany({
        where: { tenantId: actor.tenantId },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: subjectSelect,
      });
    });
  }

  async create(
    command: CreateAceSubjectDto,
    actor: AceSubjectActor,
  ): Promise<AceSubjectResponse> {
    this.assertActor(actor);
    try {
      return await withTenantRlsContext(
        actor.tenantId,
        actor.orgId,
        async (tx) => {
          await this.requireSite(tx, actor);
          const subject = await tx.subject.create({
            data: {
              tenantId: actor.tenantId,
              name: command.name,
              isActive: true,
            },
            select: subjectSelect,
          });
          await this.audit(tx, actor, subject.id, AuditAction.CREATED, {
            reason: command.reason,
            name: subject.name,
          });
          return subject;
        },
      );
    } catch (error) {
      this.throwWriteError(error);
    }
  }

  async rename(
    id: string,
    command: RenameAceSubjectDto,
    actor: AceSubjectActor,
  ): Promise<AceSubjectResponse> {
    this.assertActor(actor);
    try {
      return await withTenantRlsContext(
        actor.tenantId,
        actor.orgId,
        async (tx) => {
          await this.requireSite(tx, actor);
          const existing = await this.requireSubject(tx, id, actor.tenantId);
          if (!existing.isActive) {
            throw new ConflictException("Inactive subjects cannot be renamed");
          }
          const subject = await tx.subject.update({
            where: {
              id_tenantId: { id, tenantId: actor.tenantId },
              isActive: true,
            },
            data: { name: command.name },
            select: subjectSelect,
          });
          await this.audit(tx, actor, id, AuditAction.UPDATED, {
            reason: command.reason,
            previousName: existing.name,
            name: subject.name,
          });
          return subject;
        },
      );
    } catch (error) {
      this.throwWriteError(error);
    }
  }

  async deactivate(
    id: string,
    command: DeactivateAceSubjectDto,
    actor: AceSubjectActor,
  ): Promise<AceSubjectResponse> {
    this.assertActor(actor);
    try {
      return await withTenantRlsContext(
        actor.tenantId,
        actor.orgId,
        async (tx) => {
          await this.requireSite(tx, actor);
          const existing = await this.requireSubject(tx, id, actor.tenantId);
          if (!existing.isActive) return existing;

          const subject = await tx.subject.update({
            where: {
              id_tenantId: { id, tenantId: actor.tenantId },
              isActive: true,
            },
            data: { isActive: false },
            select: subjectSelect,
          });
          await this.audit(tx, actor, id, AuditAction.UPDATED, {
            reason: command.reason,
            name: subject.name,
            isActive: false,
          });
          return subject;
        },
      );
    } catch (error) {
      this.throwWriteError(error);
    }
  }

  private assertActor(actor: AceSubjectActor): void {
    if (
      !actor.tenantId?.trim() ||
      !actor.orgId?.trim() ||
      !actor.userId?.trim()
    ) {
      throw new BadRequestException("A complete active-site actor is required");
    }
  }

  private async requireSite(
    tx: Prisma.TransactionClient,
    actor: AceSubjectActor,
  ): Promise<void> {
    const site = await tx.tenant.findFirst({
      where: { id: actor.tenantId, orgId: actor.orgId },
      select: { id: true },
    });
    if (!site) throw new NotFoundException("Active site not found");
  }

  private async requireSubject(
    tx: Prisma.TransactionClient,
    id: string,
    tenantId: string,
  ): Promise<AceSubjectResponse> {
    const subject = await tx.subject.findFirst({
      where: { id, tenantId },
      select: subjectSelect,
    });
    if (!subject) throw new NotFoundException("Subject not found");
    return subject;
  }

  private async audit(
    tx: Prisma.TransactionClient,
    actor: AceSubjectActor,
    subjectId: string,
    action: AuditAction,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await recordAuditEventInTransaction(tx, {
      actorUserId: actor.userId,
      tenantId: actor.tenantId,
      orgId: actor.orgId,
      entityType: AuditEntityType.ACE_RECORD,
      entityId: subjectId,
      action,
      metadata: { subjectId, ...metadata },
    });
  }

  private throwWriteError(error: unknown): never {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      throw new ConflictException(
        "A subject with this name already exists at this site",
      );
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2025"
    ) {
      throw new ConflictException("Subject changed before it could be updated");
    }
    throw error;
  }
}
