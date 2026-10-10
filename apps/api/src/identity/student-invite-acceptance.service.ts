import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
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
import { verifiedFamilyInviteEmail } from "./family-verified-email";
import { hasOtherSiteAccess } from "./student-account-eligibility";
import {
  requireAceStudentSite,
  requireEnabledStudentPortal,
} from "./student-portal-policy.service";

@Injectable()
export class StudentInviteAcceptanceService {
  constructor(
    @Inject(ClerkManagementService)
    private readonly clerk: ClerkManagementService,
  ) {}

  verifiedEmail(principal: VerifiedPrincipal): Promise<string | null> {
    return verifiedFamilyInviteEmail(principal, this.clerk);
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
        where: { id: inviteId, tenantId, target: "STUDENT" },
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

  async accept(
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
        where: { id: inviteId, tenantId, target: "STUDENT" },
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
        throw new ForbiddenException("Student account is inactive");
      }
      if (invite.acceptedAt) {
        return { id: inviteId, acceptedAt: invite.acceptedAt };
      }
      if (
        invite.revokedAt ||
        invite.expiresAt <= new Date() ||
        !invite.childId
      ) {
        throw new ConflictException("Invitation is no longer available");
      }
      await lockFamilyInvite(tx, tenantId, invite.childId);
      await lockFamilyInvite(tx, tenantId, userId);
      await requireAceStudentSite(tx, tenantId, orgId);
      await requireEnabledStudentPortal(tx, tenantId);
      const [child, guardian, activeChildLink, currentIdentity, otherAccess] =
        await Promise.all([
          tx.child.findFirst({
            where: { id: invite.childId, tenantId, isGuest: false },
            select: { id: true },
          }),
          tx.guardianIdentity.findUnique({
            where: { tenantId_userId: { tenantId, userId } },
            select: { id: true },
          }),
          tx.studentIdentityLink.findFirst({
            where: {
              tenantId,
              childId: invite.childId,
              endedAt: null,
              revokedAt: null,
            },
            select: { id: true },
          }),
          tx.studentIdentity.findUnique({
            where: { tenantId_userId: { tenantId, userId } },
            select: {
              id: true,
              links: {
                where: { tenantId, endedAt: null, revokedAt: null },
                select: { id: true },
                take: 1,
              },
            },
          }),
          hasOtherSiteAccess(tx, tenantId, orgId, userId),
        ]);
      if (
        !child ||
        guardian ||
        activeChildLink ||
        currentIdentity?.links.length ||
        otherAccess
      ) {
        throw new ConflictException("Student access requires review");
      }
      if (invite.invitedUserId !== userId) {
        await tx.familyIdentityInvite.update({
          where: { id_tenantId: { id: inviteId, tenantId } },
          data: { invitedUserId: userId },
        });
      }
      const identity =
        currentIdentity ??
        (await tx.studentIdentity.create({
          data: { tenantId, userId },
          select: { id: true },
        }));
      const link = await tx.studentIdentityLink.create({
        data: { tenantId, studentIdentityId: identity.id, childId: child.id },
        select: { id: true },
      });
      await recordAuditEventInTransaction(tx, {
        actorUserId: userId,
        tenantId,
        orgId,
        entityType: AuditEntityType.ACE_RECORD,
        entityId: link.id,
        action: AuditAction.CREATED,
        metadata: {
          kind: "STUDENT_IDENTITY_LINK",
          source: "FAMILY_INVITE",
          inviteId,
          childId: child.id,
        },
      });
      await tx.user.update({
        where: { id: userId },
        data: { lastActiveTenantId: user.lastActiveTenantId ?? tenantId },
      });
      const acceptedAt = new Date();
      await tx.familyIdentityInvite.update({
        where: { id_tenantId: { id: inviteId, tenantId } },
        data: { acceptedAt, acceptedStudentIdentityId: identity.id },
      });
      await auditFamilyInvite(tx, tenantId, orgId, userId, inviteId, "accept", {
        target: "STUDENT",
        childId: child.id,
        linkId: link.id,
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
