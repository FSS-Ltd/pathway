import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { withTenantRlsContext, type Prisma } from "@pathway/db";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import type {
  CreateNoticeDraftDto,
  ListNoticeDraftsDto,
  UpdateNoticeDraftDto,
} from "./dto/ace-notice-draft.dto";

export interface NoticeDraftActor {
  tenantId: string;
  orgId: string;
  userId: string;
}

const draftSelect = {
  id: true,
  title: true,
  body: true,
  audience: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const draftSummarySelect = {
  id: true,
  title: true,
  audience: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type NoticeDraft = Prisma.AceNoticeGetPayload<{
  select: typeof draftSelect;
}>;
export type NoticeDraftSummary = Prisma.AceNoticeGetPayload<{
  select: typeof draftSummarySelect;
}>;
export interface NoticeDraftPage {
  items: NoticeDraftSummary[];
  nextCursor: string | null;
}

@Injectable()
export class AceNoticeDraftsService {
  async create(
    command: CreateNoticeDraftDto,
    actor: NoticeDraftActor,
  ): Promise<NoticeDraft> {
    this.assertActor(actor);
    this.assertFutureExpiry(command.expiresAt);
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await this.requireAceAuthor(tx, actor);
      const notice = await tx.aceNotice.create({
        data: {
          tenantId: actor.tenantId,
          createdByUserId: actor.userId,
          title: command.title,
          body: command.body,
          audience: command.audience,
          expiresAt: command.expiresAt ? new Date(command.expiresAt) : null,
        },
        select: draftSelect,
      });
      await this.audit(
        tx,
        actor,
        notice.id,
        AuditAction.CREATED,
        notice.updatedAt,
      );
      return notice;
    });
  }

  async list(
    query: ListNoticeDraftsDto,
    actor: NoticeDraftActor,
  ): Promise<NoticeDraftPage> {
    this.assertActor(actor);
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await this.requireAceAuthor(tx, actor);
      const scope: Prisma.AceNoticeWhereInput = {
        tenantId: actor.tenantId,
        publishedAt: null,
      };
      const cursor = query.cursor
        ? await tx.aceNotice.findFirst({
            where: { ...scope, id: query.cursor },
            select: { id: true, createdAt: true },
          })
        : null;
      if (query.cursor && !cursor) {
        throw new BadRequestException("Invalid notice draft cursor");
      }
      const rows = await tx.aceNotice.findMany({
        where: {
          ...scope,
          ...(cursor
            ? {
                OR: [
                  { createdAt: { lt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: query.limit + 1,
        select: draftSummarySelect,
      });
      const items = rows.slice(0, query.limit);
      return {
        items,
        nextCursor:
          rows.length > query.limit ? (items.at(-1)?.id ?? null) : null,
      };
    });
  }

  async get(id: string, actor: NoticeDraftActor): Promise<NoticeDraft> {
    this.assertActor(actor);
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await this.requireAceAuthor(tx, actor);
      const notice = await tx.aceNotice.findFirst({
        where: { id, tenantId: actor.tenantId, publishedAt: null },
        select: draftSelect,
      });
      if (!notice) throw new NotFoundException("Notice draft not found");
      return notice;
    });
  }

  async update(
    id: string,
    command: UpdateNoticeDraftDto,
    actor: NoticeDraftActor,
  ): Promise<NoticeDraft> {
    this.assertActor(actor);
    this.assertFutureExpiry(command.expiresAt);
    const expectedUpdatedAt = new Date(command.expectedUpdatedAt);
    const updatedAt = new Date(
      Math.max(Date.now(), expectedUpdatedAt.getTime() + 1),
    );
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await this.requireAceAuthor(tx, actor);
      const result = await tx.aceNotice.updateMany({
        where: {
          id,
          tenantId: actor.tenantId,
          publishedAt: null,
          updatedAt: expectedUpdatedAt,
        },
        data: {
          title: command.title,
          body: command.body,
          audience: command.audience,
          expiresAt: command.expiresAt ? new Date(command.expiresAt) : null,
          updatedAt,
        },
      });
      if (result.count === 0) {
        const current = await tx.aceNotice.findFirst({
          where: { id, tenantId: actor.tenantId },
          select: { publishedAt: true },
        });
        if (!current) throw new NotFoundException("Notice draft not found");
        throw new ConflictException("Notice draft changed or was published");
      }
      const notice = await tx.aceNotice.findFirst({
        where: { id, tenantId: actor.tenantId, publishedAt: null },
        select: draftSelect,
      });
      if (!notice) throw new ConflictException("Notice draft was published");
      await this.audit(tx, actor, id, AuditAction.UPDATED, notice.updatedAt);
      return notice;
    });
  }

  private assertActor(actor: NoticeDraftActor): void {
    if (
      !actor.tenantId?.trim() ||
      !actor.orgId?.trim() ||
      !actor.userId?.trim()
    ) {
      throw new BadRequestException("A complete active-site actor is required");
    }
  }

  private assertFutureExpiry(expiresAt: string | null): void {
    if (expiresAt && !(new Date(expiresAt).getTime() > Date.now())) {
      throw new BadRequestException("Notice expiry must be in the future");
    }
  }

  private async requireAceAuthor(
    tx: Prisma.TransactionClient,
    actor: NoticeDraftActor,
  ): Promise<void> {
    const [site, vertical, membership, student] = await Promise.all([
      tx.tenant.findFirst({
        where: { id: actor.tenantId, orgId: actor.orgId },
        select: { id: true },
      }),
      tx.orgVertical.findFirst({
        where: { orgId: actor.orgId, vertical: "ACE_SCHOOL" },
        select: { orgId: true },
      }),
      tx.siteMembership.findFirst({
        where: { tenantId: actor.tenantId, userId: actor.userId },
        select: { id: true },
      }),
      tx.studentIdentity.findFirst({
        where: { tenantId: actor.tenantId, userId: actor.userId },
        select: { id: true },
      }),
    ]);
    if (!site || !vertical) throw new NotFoundException("ACE site not found");
    if (!membership || student) {
      throw new ForbiddenException("ACE notice author access denied");
    }
  }

  private async audit(
    tx: Prisma.TransactionClient,
    actor: NoticeDraftActor,
    noticeId: string,
    action: AuditAction,
    updatedAt: Date,
  ): Promise<void> {
    await recordAuditEventInTransaction(tx, {
      actorUserId: actor.userId,
      tenantId: actor.tenantId,
      orgId: actor.orgId,
      entityType: AuditEntityType.ACE_NOTICE,
      entityId: noticeId,
      action,
      metadata: { state: "DRAFT", updatedAt: updatedAt.toISOString() },
    });
  }
}
