import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import { ClerkManagementService } from "../auth/clerk-management.service";
import type { VerifiedPrincipal } from "../auth/token-verifier";
import {
  auditFamilyInvite,
  lockFamilyInvite,
  orgIdForInviteSite,
} from "./family-invite-operations";

@Injectable()
export class GuardianInviteAcceptanceService {
  private readonly logger = new Logger(GuardianInviteAcceptanceService.name);

  constructor(
    @Inject(ClerkManagementService)
    private readonly clerk: ClerkManagementService,
  ) {}

  async verifiedEmail(principal: VerifiedPrincipal): Promise<string | null> {
    if (principal.provider === "auth0") {
      return principal.emailVerified
        ? (principal.email?.trim().toLowerCase() ?? null)
        : null;
    }
    try {
      return await this.clerk.getVerifiedPrimaryEmail(principal.sub);
    } catch {
      this.logger.error("Guardian identity verification is unavailable");
      throw new ServiceUnavailableException(
        "Identity verification is temporarily unavailable",
      );
    }
  }

  async getForInvitee(
    tenantId: string,
    inviteId: string,
    userId: string,
    verifiedEmail: string | null,
  ) {
    const orgId = await orgIdForInviteSite(tenantId);
    return withTenantRlsContext(tenantId, orgId, async (tx) => {
      const invite = await tx.familyIdentityInvite.findFirst({
        where: {
          id: inviteId,
          tenantId,
          target: "GUARDIAN",
        },
        select: {
          id: true,
          expiresAt: true,
          acceptedAt: true,
          revokedAt: true,
          invitedEmail: true,
          invitedUserId: true,
          invitedUser: {
            select: {
              email: true,
              identities: { select: { id: true }, take: 1 },
            },
          },
          tenant: { select: { name: true } },
        },
      });
      if (!invite) throw new NotFoundException("Invitation not found");
      this.assertInvitee(invite, userId, verifiedEmail);
      return {
        id: invite.id,
        siteName: invite.tenant.name,
        expiresAt: invite.expiresAt,
        acceptedAt: invite.acceptedAt,
        revokedAt: invite.revokedAt,
      };
    });
  }

  async acceptGuardianInvite(
    tenantId: string,
    inviteId: string,
    userId: string,
    verifiedEmail: string | null,
  ): Promise<{ id: string; acceptedAt: Date }> {
    if (!verifiedEmail) throw new ForbiddenException("Verified email required");
    const orgId = await orgIdForInviteSite(tenantId);
    return withTenantRlsContext(tenantId, orgId, async (tx) => {
      await lockFamilyInvite(tx, tenantId, inviteId);
      const invite = await tx.familyIdentityInvite.findFirst({
        where: {
          id: inviteId,
          tenantId,
          target: "GUARDIAN",
        },
        include: {
          invitedUser: {
            select: {
              email: true,
              isActive: true,
              identities: { select: { id: true }, take: 1 },
            },
          },
        },
      });
      if (!invite) throw new NotFoundException("Invitation not found");
      this.assertInvitee(invite, userId, verifiedEmail);
      if (
        !invite.invitedUser.isActive ||
        (invite.invitedEmail ?? invite.invitedUser.email)?.toLowerCase() !==
          verifiedEmail.toLowerCase()
      ) {
        throw new ForbiddenException(
          "Verified email does not match invitation",
        );
      }
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { isActive: true, lastActiveTenantId: true },
      });
      if (!user?.isActive) {
        throw new ForbiddenException("Guardian account is inactive");
      }
      if (invite.acceptedAt)
        return { id: inviteId, acceptedAt: invite.acceptedAt };
      if (
        invite.revokedAt ||
        invite.expiresAt <= new Date() ||
        !invite.childId
      ) {
        throw new ConflictException("Invitation is no longer available");
      }
      await lockFamilyInvite(tx, tenantId, userId, invite.childId);
      const [child, studentIdentity] = await Promise.all([
        tx.child.findFirst({
          where: { id: invite.childId, tenantId, isGuest: false },
          select: { id: true },
        }),
        tx.studentIdentity.findUnique({
          where: { tenantId_userId: { tenantId, userId } },
          select: { id: true },
        }),
      ]);
      if (!child || studentIdentity) {
        throw new ConflictException("Guardian access requires review");
      }
      if (invite.invitedUserId !== userId) {
        await tx.familyIdentityInvite.update({
          where: { id_tenantId: { id: inviteId, tenantId } },
          data: { invitedUserId: userId },
        });
      }
      const guardian = await tx.guardianIdentity.upsert({
        where: { tenantId_userId: { tenantId, userId } },
        create: { tenantId, userId },
        update: {},
        select: { id: true },
      });
      const relationship = await tx.guardianChildRelationship.findFirst({
        where: {
          tenantId,
          guardianIdentityId: guardian.id,
          childId: child.id,
          legalAccess: "FULL",
          startsAt: { lte: new Date() },
          endedAt: null,
          revokedAt: null,
        },
        select: { id: true },
      });
      const created =
        relationship ??
        (await tx.guardianChildRelationship.create({
          data: {
            tenantId,
            guardianIdentityId: guardian.id,
            childId: child.id,
            legalAccess: "FULL",
          },
          select: { id: true },
        }));
      if (!relationship) {
        await recordAuditEventInTransaction(tx, {
          actorUserId: userId,
          tenantId,
          orgId,
          entityType: AuditEntityType.ACE_RECORD,
          entityId: created.id,
          action: AuditAction.CREATED,
          metadata: {
            kind: "GUARDIAN_RELATIONSHIP",
            source: "FAMILY_INVITE",
            inviteId,
            childId: child.id,
            legalAccess: "FULL",
          },
        });
      }
      // Keep existing parent profiles in sync; the reviewed relationship remains
      // the access check for family data and child records.
      await tx.child.update({
        where: { id: child.id },
        data: { guardians: { connect: { id: userId } } },
      });
      await tx.userTenantRole.upsert({
        where: { userId_tenantId_role: { userId, tenantId, role: "PARENT" } },
        create: { userId, tenantId, role: "PARENT" },
        update: {},
      });
      await tx.user.update({
        where: { id: userId },
        data: {
          hasFamilyAccess: true,
          lastActiveTenantId: user.lastActiveTenantId ?? tenantId,
        },
      });
      const acceptedAt = new Date();
      await tx.familyIdentityInvite.update({
        where: { id_tenantId: { id: inviteId, tenantId } },
        data: { acceptedAt, acceptedGuardianIdentityId: guardian.id },
      });
      await auditFamilyInvite(tx, tenantId, orgId, userId, inviteId, "accept", {
        childId: child.id,
        relationshipId: created.id,
      });
      return { id: inviteId, acceptedAt };
    });
  }

  private assertInvitee(
    invite: {
      invitedUserId: string;
      invitedEmail?: string | null;
      invitedUser: { email: string | null; identities: Array<{ id: string }> };
    },
    userId: string,
    verifiedEmail: string | null,
  ): void {
    if (
      !verifiedEmail ||
      (invite.invitedEmail ?? invite.invitedUser.email)?.toLowerCase() !==
        verifiedEmail.toLowerCase()
    ) {
      throw new NotFoundException("Invitation not found");
    }
    if (
      invite.invitedUserId !== userId &&
      invite.invitedUser.identities.length > 0
    ) {
      throw new ConflictException("This invitation belongs to another account");
    }
  }
}
