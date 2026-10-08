import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { OrgRole, prisma, runTransaction } from "@pathway/db";

type PersonUser = {
  id: string;
  name: string | null;
  displayName: string | null;
  email: string | null;
};

type PersonMember = {
  user: PersonUser;
  role: OrgRole;
  source: "membership" | "site" | "invite";
};

export type OrgPersonRow = {
  id: string;
  name: string;
  displayName: string | null;
  email: string;
  orgRole: OrgRole;
  siteAccessSummary: {
    allSites: boolean;
    siteCount: number;
  };
};

export type DeletedOrgPersonRow = {
  id: string;
  userId: string;
  name: string;
  displayName: string | null;
  email: string | null;
  priorOrgRole: OrgRole | null;
  priorSiteCount: number;
  deletedAt: Date;
  deletedByUserId: string;
};

const userSelect = {
  id: true,
  name: true,
  displayName: true,
  email: true,
} as const;

const isEmailValue = (value: string | null | undefined): boolean =>
  Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));

const safeDisplayName = (user: PersonUser): string => {
  const displayName = user.displayName?.trim() || null;
  const name = user.name?.trim() || null;
  const email = user.email?.trim() || null;

  if (displayName && !isEmailValue(displayName)) return displayName;
  if (name) return name;
  if (email) return "User";
  return "Unknown";
};

@Injectable()
export class OrgPeopleService {
  async listPeople(
    orgId: string,
    actorUserId: string | undefined,
  ): Promise<OrgPersonRow[]> {
    await this.assertOrgAdmin(actorUserId, orgId, "view people");

    const { members, siteCountMap } = await this.collectOrgPeople(orgId);
    return members.map(({ user, role, source }) => ({
      id: user.id,
      name: safeDisplayName(user),
      displayName: user.displayName ?? null,
      email: user.email?.trim() ?? "",
      orgRole: role,
      siteAccessSummary: {
        allSites: role === OrgRole.ORG_ADMIN && source !== "site",
        siteCount: siteCountMap.get(user.id) ?? 0,
      },
    }));
  }

  async listDeletedPeople(
    orgId: string,
    actorUserId: string | undefined,
  ): Promise<DeletedOrgPersonRow[]> {
    await this.assertOrgAdmin(actorUserId, orgId, "view deleted people");

    return prisma.orgDeletedUser.findMany({
      where: { orgId },
      orderBy: { deletedAt: "desc" },
      select: {
        id: true,
        userId: true,
        name: true,
        displayName: true,
        email: true,
        priorOrgRole: true,
        priorSiteCount: true,
        deletedAt: true,
        deletedByUserId: true,
      },
    });
  }

  async removePerson(
    orgId: string,
    targetUserId: string,
    actorUserId: string | undefined,
  ): Promise<DeletedOrgPersonRow> {
    const actorId = await this.assertOrgAdmin(
      actorUserId,
      orgId,
      "delete people",
    );
    if (targetUserId === actorId) {
      throw new BadRequestException("You cannot delete your own user account");
    }

    const siteIds = await this.getOrgSiteIds(orgId);
    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        name: true,
        displayName: true,
        email: true,
        lastActiveTenantId: true,
        orgMemberships: {
          where: { orgId },
          select: { role: true },
        },
        orgRoles: {
          where: { orgId },
          select: { role: true },
        },
        siteMemberships: {
          where: { tenantId: { in: siteIds } },
          select: { tenantId: true },
        },
        roles: {
          where: { tenantId: { in: siteIds } },
          select: { tenantId: true },
        },
        identities: {
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!target) {
      throw new NotFoundException("Person not found");
    }

    const matchingInvite = target.email
      ? await prisma.invite.findFirst({
          where: {
            orgId,
            email: { equals: target.email, mode: "insensitive" },
          },
          select: { orgRole: true },
        })
      : null;

    const hasOrgAccess =
      target.orgMemberships.length > 0 || target.orgRoles.length > 0;
    const hasSiteAccess =
      target.siteMemberships.length > 0 || target.roles.length > 0;
    const hasAcceptedInviteEvidence =
      target.identities.length > 0 && matchingInvite !== null;

    if (!hasOrgAccess && !hasSiteAccess && !hasAcceptedInviteEvidence) {
      throw new NotFoundException("Person not found in this organisation");
    }

    const priorOrgRole =
      target.orgMemberships[0]?.role ??
      target.orgRoles[0]?.role ??
      matchingInvite?.orgRole ??
      OrgRole.ORG_MEMBER;
    const priorSiteCount = new Set([
      ...target.siteMemberships.map((membership) => membership.tenantId),
      ...target.roles.map((role) => role.tenantId),
    ]).size;
    const shouldClearLastActiveTenant =
      target.lastActiveTenantId !== null &&
      siteIds.includes(target.lastActiveTenantId);
    const deletedName = safeDisplayName(target);

    return runTransaction(async (tx) => {
      const deletedUser = await tx.orgDeletedUser.create({
        data: {
          orgId,
          userId: targetUserId,
          deletedByUserId: actorId,
          name: deletedName,
          displayName: target.displayName,
          email: target.email,
          priorOrgRole,
          priorSiteCount,
        },
        select: {
          id: true,
          userId: true,
          name: true,
          displayName: true,
          email: true,
          priorOrgRole: true,
          priorSiteCount: true,
          deletedAt: true,
          deletedByUserId: true,
        },
      });

      await tx.orgMembership.deleteMany({
        where: { orgId, userId: targetUserId },
      });
      await tx.userOrgRole.deleteMany({
        where: { orgId, userId: targetUserId },
      });
      await tx.siteMembership.deleteMany({
        where: { userId: targetUserId, tenantId: { in: siteIds } },
      });
      await tx.userTenantRole.deleteMany({
        where: { userId: targetUserId, tenantId: { in: siteIds } },
      });
      if (shouldClearLastActiveTenant) {
        await tx.user.update({
          where: { id: targetUserId },
          data: { lastActiveTenantId: null },
        });
      }

      return deletedUser;
    });
  }

  async assertOrgAdmin(
    userId: string | undefined,
    orgId: string,
    action: string,
  ): Promise<string> {
    if (!userId) {
      throw new UnauthorizedException("User ID not found in request");
    }

    const membership = await prisma.orgMembership.findFirst({
      where: {
        userId,
        orgId,
        role: { in: [OrgRole.ORG_ADMIN] },
      },
    });
    const orgRole = membership
      ? null
      : await prisma.userOrgRole.findFirst({
          where: {
            userId,
            orgId,
            role: { in: [OrgRole.ORG_ADMIN] },
          },
        });

    if (!membership && !orgRole) {
      throw new UnauthorizedException(
        `You must be an Organisation admin to ${action}`,
      );
    }
    return userId;
  }

  private async collectOrgPeople(orgId: string): Promise<{
    members: PersonMember[];
    siteCountMap: Map<string, number>;
  }> {
    const [orgMembers, orgRoleMembers, orgSites, deletedUsers] =
      await Promise.all([
        prisma.orgMembership.findMany({
          where: { orgId },
          include: { user: { select: userSelect } },
        }),
        prisma.userOrgRole.findMany({
          where: { orgId },
          include: { user: { select: userSelect } },
        }),
        prisma.tenant.findMany({
          where: { orgId },
          select: { id: true },
        }),
        prisma.orgDeletedUser.findMany({
          where: { orgId },
          select: { userId: true },
        }),
      ]);

    const siteIds = orgSites.map((site) => site.id);
    const siteMembers = await prisma.siteMembership.findMany({
      where: {
        tenantId: { in: siteIds },
      },
      select: {
        userId: true,
        tenantId: true,
        user: { select: userSelect },
      },
    });

    const deletedUserIds = new Set(deletedUsers.map((row) => row.userId));
    const memberByUserId = new Map<string, PersonMember>();

    for (const member of orgRoleMembers) {
      if (!member.user) continue;
      memberByUserId.set(member.user.id, {
        user: member.user,
        role: member.role,
        source: "membership",
      });
    }
    for (const member of orgMembers) {
      if (!member.user) continue;
      memberByUserId.set(member.user.id, {
        user: member.user,
        role: member.role,
        source: "membership",
      });
    }
    for (const member of siteMembers) {
      if (!member.user || memberByUserId.has(member.user.id)) continue;
      memberByUserId.set(member.user.id, {
        user: member.user,
        role: OrgRole.ORG_MEMBER,
        source: "site",
      });
    }

    const orgInvites = await prisma.invite.findMany({
      where: { orgId },
      select: { email: true, orgRole: true },
    });
    const inviteEmails = [
      ...new Set(orgInvites.map((invite) => invite.email.toLowerCase())),
    ];
    if (inviteEmails.length > 0) {
      const usersWithIdentity = await prisma.user.findMany({
        where: {
          OR: inviteEmails.map((email) => ({
            email: { equals: email, mode: "insensitive" },
          })),
          identities: { some: {} },
        },
        select: userSelect,
      });
      for (const user of usersWithIdentity) {
        if (memberByUserId.has(user.id) || deletedUserIds.has(user.id)) {
          continue;
        }
        const invite = orgInvites.find(
          (item) => item.email.toLowerCase() === (user.email ?? "").toLowerCase(),
        );
        memberByUserId.set(user.id, {
          user,
          role: invite?.orgRole ?? OrgRole.ORG_MEMBER,
          source: "invite",
        });
      }
    }

    const siteCountMap = new Map<string, number>();
    for (const siteMember of siteMembers) {
      siteCountMap.set(
        siteMember.userId,
        (siteCountMap.get(siteMember.userId) ?? 0) + 1,
      );
    }

    return {
      members: Array.from(memberByUserId.values()),
      siteCountMap,
    };
  }

  private async getOrgSiteIds(orgId: string): Promise<string[]> {
    const sites = await prisma.tenant.findMany({
      where: { orgId },
      select: { id: true },
    });
    return sites.map((site) => site.id);
  }
}
