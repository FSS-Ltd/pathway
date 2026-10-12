import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  OrgRole,
  Prisma,
  Vertical,
  withOrgRlsContext,
  withTenantRlsContext,
} from "@pathway/db";

function isUniqueConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

@Injectable()
export class EnrolmentIdentitiesService {
  async assertOrgAdmin(orgId: string, userId: string): Promise<void> {
    if (!orgId || !userId)
      throw new ForbiddenException("Organisation administrator required.");
    const allowed = await withOrgRlsContext(orgId, async (tx) => {
      const [membership, legacyRole, vertical] = await Promise.all([
        tx.orgMembership.findUnique({
          where: { orgId_userId: { orgId, userId } },
          select: { role: true },
        }),
        tx.userOrgRole.findUnique({
          where: {
            userId_orgId_role: { userId, orgId, role: OrgRole.ORG_ADMIN },
          },
          select: { id: true },
        }),
        tx.orgVertical.findUnique({
          where: { orgId },
          select: { vertical: true },
        }),
      ]);
      return (
        vertical?.vertical !== Vertical.HOME_EDUCATION &&
        (membership?.role === OrgRole.ORG_ADMIN || Boolean(legacyRole))
      );
    });
    if (!allowed)
      throw new ForbiddenException("Organisation administrator required.");
  }

  async candidates(orgId: string, tenantId: string) {
    return withTenantRlsContext(tenantId, orgId, async (tx) => {
      const site = await tx.tenant.findFirst({
        where: { id: tenantId, orgId },
        select: { id: true },
      });
      if (!site) throw new NotFoundException("Site not found.");
      return tx.child.findMany({
        where: { tenantId, isGuest: false, enrolmentLink: null },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          dateOfBirth: true,
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      });
    });
  }

  async createIdentity(
    orgId: string,
    tenantId: string,
    localReference: string,
    childId: string,
  ) {
    const reference = localReference.trim().toUpperCase();
    if (!reference || reference.length > 80)
      throw new BadRequestException("Invalid local reference.");
    try {
      return await withTenantRlsContext(tenantId, orgId, async (tx) => {
        const child = await tx.child.findFirst({
          where: { id: childId, tenantId, tenant: { orgId }, isGuest: false },
          select: { id: true },
        });
        if (!child)
          throw new NotFoundException("Child profile not found at this site.");
        return tx.orgChildIdentity.create({
          data: {
            orgId,
            localReference: reference,
            siteLinks: { create: { tenantId, childId } },
          },
          select: { id: true, localReference: true },
        });
      });
    } catch (error) {
      if (isUniqueConflict(error))
        throw new ConflictException("Identity or profile already linked.");
      throw error;
    }
  }

  async linkProfile(
    orgId: string,
    tenantId: string,
    identityId: string,
    childId: string,
  ) {
    try {
      return await withTenantRlsContext(tenantId, orgId, async (tx) => {
        const [identity, child] = await Promise.all([
          tx.orgChildIdentity.findFirst({
            where: { id: identityId, orgId },
            select: { id: true },
          }),
          tx.child.findFirst({
            where: { id: childId, tenantId, tenant: { orgId }, isGuest: false },
            select: { id: true },
          }),
        ]);
        if (!identity || !child)
          throw new NotFoundException(
            "Identity or site child profile not found.",
          );
        return tx.orgChildSiteLink.create({
          data: { orgId, identityId, tenantId, childId },
          select: { id: true, identityId: true, tenantId: true, childId: true },
        });
      });
    } catch (error) {
      if (isUniqueConflict(error))
        throw new ConflictException("Child profile already linked.");
      throw error;
    }
  }
}
