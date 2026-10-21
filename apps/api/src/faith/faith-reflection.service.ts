import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import { canReleaseReflection } from "@pathway/platform";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import { requireFaithStaff, type FaithActor } from "./faith-access";
import type {
  CreateReflection,
  ListReflections,
  ModerateReflection,
  ReportReflection,
} from "./dto/create-reflection.dto";
import {
  currentFaithVersion,
  currentFamilyFaithVersion,
} from "./faith-reflection-access";
import { listFaithReflections, markFaithRead } from "./faith-reflection-read";
import { reportVisibleFaithReflection } from "./faith-safeguarding.bridge";

const notFound = () => new NotFoundException("Faith reflection not found");

@Injectable()
export class FaithReflectionService {
  markRead(contentId: string, actor: FaithActor) {
    return markFaithRead(contentId, actor);
  }

  async submit(contentId: string, input: CreateReflection, actor: FaithActor) {
    if (process.env.ACE_FAITH_REFLECTIONS_ENABLED !== "true") {
      throw new ServiceUnavailableException(
        "Faith reflections are not enabled",
      );
    }
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const { reader, version } = await currentFamilyFaithVersion(
        tx,
        actor,
        contentId,
      );
      if (reader.kind !== "STUDENT") throw notFound();
      const settings = await tx.faithSiteSettings.findUnique({
        where: { tenantId: actor.tenantId },
        select: { reflectionsEnabled: true },
      });
      if (!settings?.reflectionsEnabled) {
        throw new ServiceUnavailableException(
          "Faith reflections are not enabled",
        );
      }
      const existing = await tx.faithReflection.findUnique({
        where: {
          tenantId_faithContentVersionId_studentIdentityId: {
            tenantId: actor.tenantId,
            faithContentVersionId: version.id,
            studentIdentityId: reader.studentIdentityId,
          },
        },
        select: { id: true },
      });
      if (existing) throw new ConflictException("Reflection already submitted");
      let reflection: {
        id: string;
        visibility: "AUTHOR_AND_STAFF" | "RELEASED_GUARDIANS";
        moderationStatus: "PENDING" | "APPROVED" | "REJECTED";
      };
      try {
        reflection = await tx.faithReflection.create({
          data: {
            tenantId: actor.tenantId,
            faithContentVersionId: version.id,
            studentIdentityId: reader.studentIdentityId,
            childId: reader.childId,
            reflectionEncrypted: input.text,
            submittedAt: new Date(),
          },
          select: { id: true, visibility: true, moderationStatus: true },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw new ConflictException("Reflection already submitted");
        }
        throw error;
      }
      await this.audit(
        tx,
        actor,
        reflection.id,
        AuditAction.CREATED,
        "SUBMITTED",
      );
      return reflection;
    });
  }

  list(contentId: string, query: ListReflections, actor: FaithActor) {
    return listFaithReflections(contentId, query, actor);
  }

  async moderate(
    contentId: string,
    reflectionId: string,
    input: ModerateReflection,
    actor: FaithActor,
  ) {
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireFaithStaff(tx, actor);
      const version = await currentFaithVersion(tx, actor, contentId);
      const result = await tx.faithReflection.updateMany({
        where: {
          id: reflectionId,
          tenantId: actor.tenantId,
          faithContentVersionId: version.id,
          moderationStatus: "PENDING",
        },
        data: {
          moderationStatus: input.decision,
          moderatedAt: new Date(),
          moderatedByUserId: actor.userId,
        },
      });
      if (result.count !== 1) throw notFound();
      await this.audit(
        tx,
        actor,
        reflectionId,
        AuditAction.UPDATED,
        input.decision,
      );
      return { id: reflectionId, moderationStatus: input.decision };
    });
  }

  async release(contentId: string, reflectionId: string, actor: FaithActor) {
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireFaithStaff(tx, actor);
      const version = await currentFaithVersion(tx, actor, contentId);
      const reflection = await tx.faithReflection.findFirst({
        where: {
          id: reflectionId,
          tenantId: actor.tenantId,
          faithContentVersionId: version.id,
        },
        select: {
          studentIdentityId: true,
          childId: true,
          visibility: true,
          moderationStatus: true,
          guardianReleasedAt: true,
        },
      });
      if (
        !reflection ||
        !reflection.childId ||
        !canReleaseReflection(reflection)
      ) {
        throw notFound();
      }
      const result = await tx.faithReflection.updateMany({
        where: {
          id: reflectionId,
          tenantId: actor.tenantId,
          faithContentVersionId: version.id,
          visibility: "AUTHOR_AND_STAFF",
          moderationStatus: "APPROVED",
          guardianReleasedAt: null,
        },
        data: {
          visibility: "RELEASED_GUARDIANS",
          guardianReleasedAt: new Date(),
          releasedByUserId: actor.userId,
        },
      });
      if (result.count !== 1) throw notFound();
      await this.audit(
        tx,
        actor,
        reflectionId,
        AuditAction.UPDATED,
        "RELEASED",
      );
      return { id: reflectionId, visibility: "RELEASED_GUARDIANS" as const };
    });
  }

  report(
    contentId: string,
    reflectionId: string,
    input: ReportReflection,
    requestedChildId: string | undefined,
    actor: FaithActor,
  ) {
    return reportVisibleFaithReflection(
      contentId,
      reflectionId,
      input,
      requestedChildId,
      actor,
    );
  }

  private audit(
    tx: Parameters<typeof recordAuditEventInTransaction>[0],
    actor: FaithActor,
    reflectionId: string,
    action: AuditAction,
    state: string,
  ) {
    return recordAuditEventInTransaction(tx, {
      actorUserId: actor.userId,
      tenantId: actor.tenantId,
      orgId: actor.orgId,
      entityType: AuditEntityType.ACE_RECORD,
      entityId: reflectionId,
      action,
      metadata: { kind: "faith_reflection", state },
    });
  }
}
