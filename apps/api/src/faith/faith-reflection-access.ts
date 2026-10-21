import { NotFoundException } from "@nestjs/common";
import type { Prisma } from "@pathway/db";
import type { FaithActor } from "./faith-access";
import { requireFaithStaff } from "./faith-access";
import { faithAudienceIncludesAge, resolveFaithReader } from "./faith-reader";

export async function currentFaithVersion(
  tx: Prisma.TransactionClient,
  actor: FaithActor,
  contentId: string,
  now = new Date(),
) {
  const content = await tx.faithContent.findFirst({
    where: { id: contentId, tenantId: actor.tenantId, withdrawnAt: null },
    select: {
      versions: {
        where: { publishedAt: { lte: now } },
        orderBy: { versionNumber: "desc" },
        take: 1,
        select: {
          id: true,
          audiences: {
            select: { type: true, minimumAge: true, maximumAge: true },
          },
        },
      },
    },
  });
  const version = content?.versions[0];
  if (!version) throw new NotFoundException("Faith content not found");
  return version;
}

export async function currentFamilyFaithVersion(
  tx: Prisma.TransactionClient,
  actor: FaithActor,
  contentId: string,
  requestedChildId?: string,
  now = new Date(),
) {
  const [{ reader, today }, version] = await Promise.all([
    resolveFaithReader(tx, actor, requestedChildId, now),
    currentFaithVersion(tx, actor, contentId, now),
  ]);
  const [child, enrollment] = await Promise.all([
    tx.child.findFirst({
      where: { id: reader.childId, tenantId: actor.tenantId, isGuest: false },
      select: { dateOfBirth: true },
    }),
    tx.aceSchoolEnrollment.findFirst({
      where: {
        tenantId: actor.tenantId,
        childId: reader.childId,
        startsOn: { lte: today },
        OR: [{ endsOn: null }, { endsOn: { gte: today } }],
      },
      select: { id: true },
    }),
  ]);
  if (
    !child ||
    !enrollment ||
    !faithAudienceIncludesAge(version.audiences, child.dateOfBirth, today)
  ) {
    throw new NotFoundException("Faith content not found");
  }
  return { reader, version };
}

export async function reflectionViewer(
  tx: Prisma.TransactionClient,
  actor: FaithActor,
  contentId: string,
  requestedChildId?: string,
) {
  const membership = await tx.siteMembership.findUnique({
    where: {
      tenantId_userId: { tenantId: actor.tenantId, userId: actor.userId },
    },
    select: { role: true },
  });
  if (membership?.role === "STAFF" || membership?.role === "SITE_ADMIN") {
    await requireFaithStaff(tx, actor);
    return {
      reader: { kind: "STAFF" as const },
      version: await currentFaithVersion(tx, actor, contentId),
    };
  }
  return currentFamilyFaithVersion(tx, actor, contentId, requestedChildId);
}
