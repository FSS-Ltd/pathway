import { BadRequestException } from "@nestjs/common";
import {
  prisma,
  runReadOnlyTransaction,
  withTenantRlsContext,
} from "@pathway/db";

const MAX_STUDENT_SITES = 100;

export async function listStudentActiveSites(userId: string) {
  const identities = await runReadOnlyTransaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
    await tx.$executeRawUnsafe("SET LOCAL row_security = on");
    return tx.studentIdentity.findMany({
      where: { userId, user: { isActive: true } },
      select: { tenantId: true },
      take: MAX_STUDENT_SITES + 1,
    });
  });
  if (identities.length > MAX_STUDENT_SITES) {
    throw new BadRequestException("Too many linked sites to display");
  }
  if (identities.length === 0) return [];

  const sites = await prisma.tenant.findMany({
    where: { id: { in: identities.map(({ tenantId }) => tenantId) } },
    select: {
      id: true,
      name: true,
      orgId: true,
      timezone: true,
      org: { select: { name: true, slug: true } },
    },
  });
  const active = [];
  for (const site of sites) {
    const permitted = await withTenantRlsContext(
      site.id,
      site.orgId,
      async (tx) => {
        const [policy, links] = await Promise.all([
          tx.studentPortalPolicy.findUnique({
            where: { tenantId: site.id },
            select: { studentPortalEnabled: true },
          }),
          tx.studentIdentityLink.findMany({
            where: {
              tenantId: site.id,
              linkedAt: { lte: new Date() },
              endedAt: null,
              revokedAt: null,
              studentIdentity: { tenantId: site.id, userId },
              child: { tenantId: site.id, isGuest: false },
            },
            select: { id: true },
            take: 2,
          }),
        ]);
        return policy?.studentPortalEnabled === true && links.length === 1;
      },
    );
    if (permitted) active.push(site);
  }
  return active;
}
