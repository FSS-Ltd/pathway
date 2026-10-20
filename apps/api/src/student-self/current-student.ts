import { NotFoundException } from "@nestjs/common";
import type { Prisma } from "@pathway/db";

export async function requireCurrentStudent(
  tx: Prisma.TransactionClient,
  siteId: string,
  userId: string,
  now: Date,
  schoolDay: string,
  notFoundMessage = "Student summary not found",
): Promise<{ id: string; name: string }> {
  const date = new Date(`${schoolDay}T00:00:00.000Z`);
  const [policy, links] = await Promise.all([
    tx.studentPortalPolicy.findUnique({
      where: { tenantId: siteId },
      select: { studentPortalEnabled: true },
    }),
    tx.studentIdentityLink.findMany({
      where: {
        tenantId: siteId,
        linkedAt: { lte: now },
        endedAt: null,
        revokedAt: null,
        studentIdentity: {
          tenantId: siteId,
          userId,
          user: { isActive: true },
        },
        child: { tenantId: siteId, isGuest: false },
      },
      select: {
        child: { select: { id: true, firstName: true, lastName: true } },
      },
      take: 2,
    }),
  ]);
  if (!policy?.studentPortalEnabled || links.length !== 1) {
    throw new NotFoundException(notFoundMessage);
  }
  const child = links[0].child;
  const enrollment = await tx.aceSchoolEnrollment.findFirst({
    where: {
      tenantId: siteId,
      childId: child.id,
      startsOn: { lte: date },
      OR: [{ endsOn: null }, { endsOn: { gte: date } }],
    },
    select: { id: true },
  });
  if (!enrollment) throw new NotFoundException(notFoundMessage);
  return { id: child.id, name: `${child.firstName} ${child.lastName}`.trim() };
}
