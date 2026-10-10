import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { MailerService } from "../mailer/mailer.service";
import {
  auditFamilyInvite,
  lockFamilyInvite,
} from "./family-invite-operations";
import { hasOtherSiteAccess } from "./student-account-eligibility";
import {
  requireAceStudentSite,
  requireEnabledStudentPortal,
} from "./student-portal-policy.service";

export interface StudentInviteSummary {
  id: string;
  email: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
}

const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000;

@Injectable()
export class StudentInvitesService {
  private readonly logger = new Logger(StudentInvitesService.name);

  constructor(@Inject(MailerService) private readonly mailer: MailerService) {}

  async create(
    tenantId: string,
    orgId: string,
    actorUserId: string,
    childId: string,
    email: string,
  ): Promise<StudentInviteSummary> {
    const normalizedEmail = email.trim().toLowerCase();
    const result = await withTenantRlsContext(tenantId, orgId, async (tx) => {
      await lockFamilyInvite(tx, tenantId, childId);
      await requireAceStudentSite(tx, tenantId, orgId);
      const [site, child, matchingUsers, activeLink, pendingInvite] =
        await Promise.all([
          tx.tenant.findFirst({
            where: { id: tenantId, orgId },
            select: { name: true },
          }),
          tx.child.findFirst({
            where: { id: childId, tenantId, isGuest: false },
            select: { id: true },
          }),
          tx.user.findMany({
            where: { email: { equals: normalizedEmail, mode: "insensitive" } },
            select: { id: true, isActive: true },
            take: 2,
          }),
          tx.studentIdentityLink.findFirst({
            where: { tenantId, childId, endedAt: null, revokedAt: null },
            select: { id: true },
          }),
          tx.familyIdentityInvite.findFirst({
            where: {
              tenantId,
              childId,
              target: "STUDENT",
              acceptedAt: null,
              revokedAt: null,
              expiresAt: { gt: new Date() },
            },
            select: { id: true, invitedUserId: true },
          }),
        ]);
      if (!site || !child) throw new NotFoundException("Child not found");
      await requireEnabledStudentPortal(tx, tenantId);
      if (activeLink) {
        throw new ConflictException("This child already has student access");
      }
      if (matchingUsers.length > 1 || matchingUsers[0]?.isActive === false) {
        throw new ConflictException("This account needs an identity review");
      }
      const user =
        matchingUsers[0] ??
        (await tx.user.create({
          data: { email: normalizedEmail },
          select: { id: true },
        }));
      if (pendingInvite && pendingInvite.invitedUserId !== user.id) {
        throw new ConflictException(
          "Revoke the current student invitation first",
        );
      }
      const [guardian, identity, otherAccess] = await Promise.all([
        tx.guardianIdentity.findUnique({
          where: { tenantId_userId: { tenantId, userId: user.id } },
          select: { id: true },
        }),
        tx.studentIdentity.findUnique({
          where: { tenantId_userId: { tenantId, userId: user.id } },
          select: {
            links: {
              where: { tenantId, endedAt: null, revokedAt: null },
              select: { id: true },
              take: 1,
            },
          },
        }),
        hasOtherSiteAccess(tx, tenantId, orgId, user.id),
      ]);
      if (guardian || identity?.links.length || otherAccess) {
        throw new ConflictException(
          "This account cannot be invited as a student",
        );
      }
      const expiresAt = new Date(Date.now() + INVITE_LIFETIME_MS);
      const invite = pendingInvite
        ? await tx.familyIdentityInvite.update({
            where: { id_tenantId: { id: pendingInvite.id, tenantId } },
            data: { invitedEmail: normalizedEmail, expiresAt },
          })
        : await tx.familyIdentityInvite.create({
            data: {
              tenantId,
              childId,
              invitedUserId: user.id,
              invitedEmail: normalizedEmail,
              createdByUserId: actorUserId,
              target: "STUDENT",
              expiresAt,
            },
          });
      await auditFamilyInvite(
        tx,
        tenantId,
        orgId,
        actorUserId,
        invite.id,
        pendingInvite ? "resend" : "create",
        { childId, target: "STUDENT", schoolApproval: "confirmed" },
      );
      return { invite, siteName: site.name };
    });
    await this.send(
      normalizedEmail,
      result.siteName,
      tenantId,
      result.invite.id,
    );
    return this.summary(result.invite, normalizedEmail);
  }

  async list(
    tenantId: string,
    orgId: string,
    childId: string,
  ): Promise<StudentInviteSummary[]> {
    return withTenantRlsContext(tenantId, orgId, async (tx) => {
      await requireAceStudentSite(tx, tenantId, orgId);
      const child = await tx.child.findFirst({
        where: { id: childId, tenantId },
        select: { id: true },
      });
      if (!child) throw new NotFoundException("Child not found");
      const invites = await tx.familyIdentityInvite.findMany({
        where: { tenantId, childId, target: "STUDENT" },
        select: {
          id: true,
          invitedEmail: true,
          invitedUser: { select: { email: true } },
          expiresAt: true,
          acceptedAt: true,
          revokedAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      return invites.map((invite) =>
        this.summary(
          invite,
          invite.invitedEmail ?? invite.invitedUser.email ?? "",
        ),
      );
    });
  }

  async resend(
    tenantId: string,
    orgId: string,
    actorUserId: string,
    inviteId: string,
  ): Promise<StudentInviteSummary> {
    const result = await withTenantRlsContext(tenantId, orgId, async (tx) => {
      await lockFamilyInvite(tx, tenantId, inviteId);
      await requireAceStudentSite(tx, tenantId, orgId);
      await requireEnabledStudentPortal(tx, tenantId);
      const invite = await tx.familyIdentityInvite.findFirst({
        where: { id: inviteId, tenantId, target: "STUDENT" },
        include: { invitedUser: { select: { email: true, isActive: true } } },
      });
      if (!invite) throw new NotFoundException("Invitation not found");
      if (
        invite.acceptedAt ||
        invite.revokedAt ||
        !invite.invitedUser.isActive
      ) {
        throw new ConflictException("Invitation is no longer pending");
      }
      if (!invite.childId) throw new NotFoundException("Invitation not found");
      const childId = invite.childId;
      await lockFamilyInvite(tx, tenantId, childId);
      const [child, activeLink, otherPending, guardian, identity, otherAccess] =
        await Promise.all([
          tx.child.findFirst({
            where: { id: childId, tenantId, isGuest: false },
            select: { id: true },
          }),
          tx.studentIdentityLink.findFirst({
            where: {
              tenantId,
              childId,
              endedAt: null,
              revokedAt: null,
            },
            select: { id: true },
          }),
          tx.familyIdentityInvite.findFirst({
            where: {
              tenantId,
              childId,
              target: "STUDENT",
              id: { not: inviteId },
              acceptedAt: null,
              revokedAt: null,
              expiresAt: { gt: new Date() },
            },
            select: { id: true },
          }),
          tx.guardianIdentity.findUnique({
            where: {
              tenantId_userId: {
                tenantId,
                userId: invite.invitedUserId,
              },
            },
            select: { id: true },
          }),
          tx.studentIdentity.findUnique({
            where: {
              tenantId_userId: {
                tenantId,
                userId: invite.invitedUserId,
              },
            },
            select: {
              links: {
                where: { tenantId, endedAt: null, revokedAt: null },
                select: { id: true },
                take: 1,
              },
            },
          }),
          hasOtherSiteAccess(tx, tenantId, orgId, invite.invitedUserId),
        ]);
      if (
        !child ||
        activeLink ||
        otherPending ||
        guardian ||
        identity?.links.length ||
        otherAccess
      ) {
        throw new ConflictException("Invitation requires review before resend");
      }
      const site = await tx.tenant.findFirst({
        where: { id: tenantId, orgId },
        select: { name: true },
      });
      const email = invite.invitedEmail ?? invite.invitedUser.email;
      if (!site || !email) throw new NotFoundException("Invitation not found");
      const updated = await tx.familyIdentityInvite.update({
        where: { id_tenantId: { id: inviteId, tenantId } },
        data: { expiresAt: new Date(Date.now() + INVITE_LIFETIME_MS) },
      });
      await auditFamilyInvite(
        tx,
        tenantId,
        orgId,
        actorUserId,
        inviteId,
        "resend",
        {
          target: "STUDENT",
        },
      );
      return { invite: updated, email, siteName: site.name };
    });
    await this.send(result.email, result.siteName, tenantId, inviteId);
    return this.summary(result.invite, result.email);
  }

  async revoke(
    tenantId: string,
    orgId: string,
    actorUserId: string,
    inviteId: string,
  ): Promise<{ id: string; revokedAt: Date }> {
    return withTenantRlsContext(tenantId, orgId, async (tx) => {
      await lockFamilyInvite(tx, tenantId, inviteId);
      await requireAceStudentSite(tx, tenantId, orgId);
      const invite = await tx.familyIdentityInvite.findFirst({
        where: { id: inviteId, tenantId, target: "STUDENT" },
        select: { acceptedAt: true, revokedAt: true },
      });
      if (!invite) throw new NotFoundException("Invitation not found");
      if (invite.acceptedAt) {
        throw new ConflictException("End student access instead");
      }
      if (invite.revokedAt)
        return { id: inviteId, revokedAt: invite.revokedAt };
      const revokedAt = new Date();
      await tx.familyIdentityInvite.update({
        where: { id_tenantId: { id: inviteId, tenantId } },
        data: { revokedAt, revokedByUserId: actorUserId },
      });
      await auditFamilyInvite(
        tx,
        tenantId,
        orgId,
        actorUserId,
        inviteId,
        "revoke",
        {
          target: "STUDENT",
        },
      );
      return { id: inviteId, revokedAt };
    });
  }

  private async send(
    email: string,
    siteName: string,
    tenantId: string,
    inviteId: string,
  ): Promise<void> {
    const baseUrl = process.env.ADMIN_URL ?? "https://app.nexsteps.dev";
    const inviteUrl = new URL(
      `/student-invites/${encodeURIComponent(tenantId)}/${encodeURIComponent(inviteId)}`,
      baseUrl,
    ).toString();
    try {
      await this.mailer.sendStudentInviteEmail({
        to: email,
        siteName,
        inviteUrl,
      });
    } catch {
      this.logger.error("Student invitation email delivery failed");
      throw new ServiceUnavailableException(
        "Invitation saved, but email delivery failed. Retry sending it.",
      );
    }
  }

  private summary(
    invite: {
      id: string;
      expiresAt: Date;
      acceptedAt: Date | null;
      revokedAt: Date | null;
    },
    email: string,
  ): StudentInviteSummary {
    return {
      id: invite.id,
      email,
      expiresAt: invite.expiresAt,
      acceptedAt: invite.acceptedAt,
      revokedAt: invite.revokedAt,
    };
  }
}
