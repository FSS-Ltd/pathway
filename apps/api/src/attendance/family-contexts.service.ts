import { BadRequestException, Injectable } from "@nestjs/common";
import {
  prisma,
  runReadOnlyTransaction,
  withTenantRlsContext,
} from "@pathway/db";

export interface FamilyContext {
  kind: "parent" | "student";
  siteId: string;
  siteName: string;
  childId: string;
  childName: string;
}

const MAX_SITES = 100;

@Injectable()
export class FamilyContextsService {
  async list(userId: string): Promise<{ items: FamilyContext[] }> {
    if (!userId.trim()) {
      throw new BadRequestException("An authenticated user is required");
    }

    const siteIds = await runReadOnlyTransaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
      await tx.$executeRawUnsafe("SET LOCAL row_security = on");
      const [guardians, students] = await Promise.all([
        tx.guardianIdentity.findMany({
          where: { userId },
          select: { tenantId: true },
          take: MAX_SITES + 1,
        }),
        tx.studentIdentity.findMany({
          where: { userId },
          select: { tenantId: true },
          take: MAX_SITES + 1,
        }),
      ]);
      const ids = [
        ...new Set([...guardians, ...students].map(({ tenantId }) => tenantId)),
      ];
      if (
        ids.length > MAX_SITES ||
        guardians.length > MAX_SITES ||
        students.length > MAX_SITES
      ) {
        throw new BadRequestException("Too many linked sites to display");
      }
      return ids;
    });
    if (siteIds.length === 0) return { items: [] };

    const sites = await prisma.tenant.findMany({
      where: { id: { in: siteIds } },
      select: {
        id: true,
        name: true,
        orgId: true,
        org: { select: { parentPortalEnabled: true } },
      },
    });
    const items: FamilyContext[] = [];
    const now = new Date();
    for (const site of sites) {
      const scoped = await withTenantRlsContext(
        site.id,
        site.orgId,
        async (tx) => {
          const [relationships, policy, links] = await Promise.all([
            site.org.parentPortalEnabled
              ? tx.guardianChildRelationship.findMany({
                  where: {
                    tenantId: site.id,
                    legalAccess: "FULL",
                    startsAt: { lte: now },
                    endedAt: null,
                    revokedAt: null,
                    guardianIdentity: { tenantId: site.id, userId },
                    child: { tenantId: site.id, isGuest: false },
                  },
                  select: {
                    child: {
                      select: { id: true, firstName: true, lastName: true },
                    },
                  },
                })
              : Promise.resolve([]),
            tx.studentPortalPolicy.findUnique({
              where: { tenantId: site.id },
              select: { studentPortalEnabled: true },
            }),
            tx.studentIdentityLink.findMany({
              where: {
                tenantId: site.id,
                linkedAt: { lte: now },
                endedAt: null,
                revokedAt: null,
                studentIdentity: { tenantId: site.id, userId },
                child: { tenantId: site.id, isGuest: false },
              },
              select: {
                child: {
                  select: { id: true, firstName: true, lastName: true },
                },
              },
              take: 2,
            }),
          ]);
          return {
            parentChildren: relationships.map(({ child }) => child),
            studentChild:
              policy?.studentPortalEnabled && links.length === 1
                ? links[0].child
                : null,
          };
        },
      );

      for (const child of scoped.parentChildren) {
        items.push({
          kind: "parent",
          siteId: site.id,
          siteName: site.name,
          childId: child.id,
          childName: `${child.firstName} ${child.lastName}`.trim(),
        });
      }
      if (scoped.studentChild) {
        items.push({
          kind: "student",
          siteId: site.id,
          siteName: site.name,
          childId: scoped.studentChild.id,
          childName:
            `${scoped.studentChild.firstName} ${scoped.studentChild.lastName}`.trim(),
        });
      }
    }
    items.sort(
      (a, b) =>
        a.siteName.localeCompare(b.siteName) ||
        a.childName.localeCompare(b.childName) ||
        a.kind.localeCompare(b.kind),
    );
    return { items };
  }
}
