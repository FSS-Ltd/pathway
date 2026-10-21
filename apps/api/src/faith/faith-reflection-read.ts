import { NotFoundException } from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import { canReadReflection, type ReflectionReader } from "@pathway/platform";
import type { FaithActor } from "./faith-access";
import type { ListReflections } from "./dto/create-reflection.dto";
import {
  currentFamilyFaithVersion,
  reflectionViewer,
} from "./faith-reflection-access";

const notFound = () => new NotFoundException("Faith reflection not found");

export async function markFaithRead(contentId: string, actor: FaithActor) {
  return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
    const { reader, version } = await currentFamilyFaithVersion(
      tx,
      actor,
      contentId,
    );
    if (reader.kind !== "STUDENT") throw notFound();
    await tx.faithReadReceipt.createMany({
      data: [
        {
          tenantId: actor.tenantId,
          faithContentVersionId: version.id,
          studentIdentityId: reader.studentIdentityId,
          readAt: new Date(),
        },
      ],
      skipDuplicates: true,
    });
    return tx.faithReadReceipt.findUniqueOrThrow({
      where: {
        tenantId_faithContentVersionId_studentIdentityId: {
          tenantId: actor.tenantId,
          faithContentVersionId: version.id,
          studentIdentityId: reader.studentIdentityId,
        },
      },
      select: { id: true, readAt: true },
    });
  });
}

export async function listFaithReflections(
  contentId: string,
  query: ListReflections,
  actor: FaithActor,
) {
  return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
    const { reader, version } = await reflectionViewer(
      tx,
      actor,
      contentId,
      query.childId,
    );
    const scope: Prisma.FaithReflectionWhereInput = {
      tenantId: actor.tenantId,
      faithContentVersionId: version.id,
      ...(reader.kind === "STUDENT"
        ? { studentIdentityId: reader.studentIdentityId }
        : reader.kind === "GUARDIAN"
          ? {
              childId: reader.childId,
              visibility: "RELEASED_GUARDIANS",
              moderationStatus: "APPROVED",
              guardianReleasedAt: { not: null },
            }
          : {}),
    };
    if (query.cursor) {
      const cursor = await tx.faithReflection.findFirst({
        where: { ...scope, id: query.cursor },
        select: { id: true },
      });
      if (!cursor) throw notFound();
    }
    const rows = await tx.faithReflection.findMany({
      where: scope,
      orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        studentIdentityId: true,
        childId: true,
        child: { select: { firstName: true, lastName: true } },
        reflectionEncrypted: true,
        submittedAt: true,
        visibility: true,
        moderationStatus: true,
        guardianReleasedAt: true,
      },
    });
    const policyReader: ReflectionReader =
      reader.kind === "STUDENT"
        ? { kind: "STUDENT", studentIdentityId: reader.studentIdentityId }
        : reader.kind === "GUARDIAN"
          ? { kind: "GUARDIAN", hasCurrentFullRelationship: true }
          : { kind: "STAFF" };
    const items = rows
      .slice(0, query.limit)
      .filter((row) => canReadReflection(row, policyReader));
    return {
      items: items.map(({ reflectionEncrypted, child, ...row }) => ({
        ...row,
        ...(reader.kind === "STAFF" && child
          ? { studentName: `${child.firstName} ${child.lastName}`.trim() }
          : {}),
        text: reflectionEncrypted,
      })),
      nextCursor: rows.length > query.limit ? rows[query.limit - 1].id : null,
    };
  });
}
