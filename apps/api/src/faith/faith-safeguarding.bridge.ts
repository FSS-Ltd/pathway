import { NotFoundException } from "@nestjs/common";
import { withTenantRlsContext, type Prisma } from "@pathway/db";
import { canReadReflection } from "@pathway/platform";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import type { ReportReflection } from "./dto/create-reflection.dto";
import type { FaithActor } from "./faith-access";
import { reflectionViewer } from "./faith-reflection-access";

export async function reportFaithReflectionReference(
  tx: Prisma.TransactionClient,
  actor: FaithActor,
  childId: string,
  reflectionId: string,
  category: ReportReflection["category"],
): Promise<{ referenceId: string }> {
  const concern = await tx.concern.create({
    data: {
      childId,
      summary: `Faith reflection ${category.toLowerCase()} report`,
      details: `faith-reflection:${reflectionId}`,
    },
    select: { id: true },
  });
  await recordAuditEventInTransaction(tx, {
    actorUserId: actor.userId,
    tenantId: actor.tenantId,
    orgId: actor.orgId,
    entityType: AuditEntityType.CONCERN,
    entityId: concern.id,
    action: AuditAction.CREATED,
    metadata: { source: "faith_reflection", reflectionId, category },
  });
  return { referenceId: concern.id };
}

const notFound = () => new NotFoundException("Faith reflection not found");

export async function reportVisibleFaithReflection(
  contentId: string,
  reflectionId: string,
  input: ReportReflection,
  requestedChildId: string | undefined,
  actor: FaithActor,
) {
  return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
    const { reader, version } = await reflectionViewer(
      tx,
      actor,
      contentId,
      requestedChildId,
    );
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
    if (!reflection?.childId) throw notFound();
    const allowed =
      reader.kind === "STAFF"
        ? canReadReflection(reflection, { kind: "STAFF" })
        : reader.kind === "STUDENT"
          ? reflection.childId === reader.childId &&
            canReadReflection(reflection, {
              kind: "STUDENT",
              studentIdentityId: reader.studentIdentityId,
            })
          : reflection.childId === reader.childId &&
            canReadReflection(reflection, {
              kind: "GUARDIAN",
              hasCurrentFullRelationship: true,
            });
    if (!allowed) throw notFound();
    return reportFaithReflectionReference(
      tx,
      actor,
      reflection.childId,
      reflectionId,
      input.category,
    );
  });
}
