import {
  BadRequestException,
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
  findPriorImportInvite,
  lockFamilyInvite,
} from "./family-invite-operations";

export type GuardianInviteReviewBasis = "SCHOOL_RECORDS" | "LEGAL_DOCUMENT";

type GuardianInviteSummary = {
  id: string;
  email: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
};

const inviteLifetimeMs = 7 * 24 * 60 * 60 * 1_000;

@Injectable()
export class FamilyInvitesService {
  private readonly logger = new Logger(FamilyInvitesService.name);

  constructor(@Inject(MailerService) private readonly mailer: MailerService) {}

  async createGuardianInvite(
    tenantId: string,
    orgId: string,
    actorUserId: string,
    childId: string,
    email: string,
    reviewBasis: GuardianInviteReviewBasis,
    confirmedLegalAccess: boolean,
  ): Promise<GuardianInviteSummary> {
    const result = await this.createGuardianInviteInternal(
      tenantId,
      orgId,
      actorUserId,
      childId,
      email,
      reviewBasis,
      confirmedLegalAccess,
      false,
    );
    return result.summary;
  }

  async createForImport(
    tenantId: string,
    orgId: string,
    actorUserId: string,
    childId: string,
    email: string,
    reviewBasis: GuardianInviteReviewBasis,
    confirmedLegalAccess: boolean,
  ): Promise<"invited" | "existing"> {
    const result = await this.createGuardianInviteInternal(
      tenantId,
      orgId,
      actorUserId,
      childId,
      email,
      reviewBasis,
      confirmedLegalAccess,
      true,
    );
    return result.status;
  }

  private async createGuardianInviteInternal(
    tenantId: string,
    orgId: string,
    actorUserId: string,
    childId: string,
    email: string,
    reviewBasis: GuardianInviteReviewBasis,
    confirmedLegalAccess: boolean,
    importMode: boolean,
  ): Promise<{
    summary: GuardianInviteSummary;
    status: "invited" | "existing";
  }> {
    this.requireLegalAccessConfirmation(confirmedLegalAccess);
    const normalizedEmail = email.trim().toLowerCase();
    const result = await withTenantRlsContext(tenantId, orgId, async (tx) => {
      await lockFamilyInvite(tx, tenantId, childId, normalizedEmail);
      await lockFamilyInvite(tx, "email", normalizedEmail);
      const [site, child, matchingUsers, priorInvite] = await Promise.all([
        tx.tenant.findFirst({
          where: { id: tenantId, orgId },
          select: {
            name: true,
            org: { select: { parentPortalEnabled: true } },
          },
        }),
        tx.child.findFirst({
          where: { id: childId, tenantId, isGuest: false },
          select: { id: true },
        }),
        tx.user.findMany({
          where: { email: { equals: normalizedEmail, mode: "insensitive" } },
          select: { id: true, isActive: true, email: true },
          take: 2,
        }),
        importMode
          ? findPriorImportInvite(
              tx,
              tenantId,
              childId,
              "GUARDIAN",
              normalizedEmail,
            )
          : Promise.resolve(null),
      ]);
      if (!site || !child) throw new NotFoundException("Child not found");
      if (!site.org.parentPortalEnabled) {
        throw new ConflictException(
          "The family portal is not enabled for this site",
        );
      }
      if (priorInvite) {
        return {
          invite: priorInvite,
          siteName: site.name,
          email: normalizedEmail,
          shouldSend: false,
        };
      }
      if (matchingUsers.length > 1 || matchingUsers[0]?.isActive === false) {
        throw new ConflictException("This account needs an identity review");
      }
      const user =
        matchingUsers[0] ??
        (await tx.user.create({
          data: { email: normalizedEmail },
          select: { id: true, email: true },
        }));
      if (
        await tx.studentIdentity.findUnique({
          where: { tenantId_userId: { tenantId, userId: user.id } },
          select: { id: true },
        })
      ) {
        throw new ConflictException(
          "A student account cannot be invited as a guardian",
        );
      }
      const pendingStudent = await tx.familyIdentityInvite.findMany({
        where: {
          tenantId,
          invitedUserId: user.id,
          target: "STUDENT",
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
        take: 1,
      });
      if (pendingStudent.length) {
        throw new ConflictException(
          "This account has a student invitation pending",
        );
      }
      const guardian = await tx.guardianIdentity.findUnique({
        where: { tenantId_userId: { tenantId, userId: user.id } },
        select: { id: true },
      });
      if (guardian) {
        const currentRelationship =
          await tx.guardianChildRelationship.findFirst({
            where: {
              tenantId,
              guardianIdentityId: guardian.id,
              childId,
              legalAccess: "FULL",
              startsAt: { lte: new Date() },
              endedAt: null,
              revokedAt: null,
            },
            select: { id: true },
          });
        if (currentRelationship) {
          throw new ConflictException(
            "This guardian already has access to this child",
          );
        }
      }
      const now = new Date();
      const existing = await tx.familyIdentityInvite.findFirst({
        where: {
          tenantId,
          childId,
          invitedUserId: user.id,
          target: "GUARDIAN",
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        select: { id: true },
      });
      const invite = existing
        ? await tx.familyIdentityInvite.update({
            where: { id_tenantId: { id: existing.id, tenantId } },
            data: {
              invitedEmail: normalizedEmail,
              expiresAt: new Date(now.getTime() + inviteLifetimeMs),
            },
          })
        : await tx.familyIdentityInvite.create({
            data: {
              tenantId,
              childId,
              invitedUserId: user.id,
              invitedEmail: normalizedEmail,
              createdByUserId: actorUserId,
              target: "GUARDIAN",
              expiresAt: new Date(now.getTime() + inviteLifetimeMs),
            },
          });
      await auditFamilyInvite(
        tx,
        tenantId,
        orgId,
        actorUserId,
        invite.id,
        existing ? "resend" : "create",
        {
          childId,
          reviewBasis,
          legalAccess: "confirmed",
        },
      );
      return {
        invite,
        siteName: site.name,
        email: normalizedEmail,
        shouldSend: true,
      };
    });
    if (result.shouldSend) {
      await this.send(
        result.email,
        result.siteName,
        tenantId,
        result.invite.id,
      );
    }
    return {
      summary: this.summary(result.invite, result.email),
      status: result.shouldSend ? "invited" : "existing",
    };
  }

  async listGuardianInvites(
    tenantId: string,
    orgId: string,
    childId: string,
  ): Promise<GuardianInviteSummary[]> {
    return withTenantRlsContext(tenantId, orgId, async (tx) => {
      const child = await tx.child.findFirst({
        where: { id: childId, tenantId },
        select: { id: true },
      });
      if (!child) throw new NotFoundException("Child not found");
      const invites = await tx.familyIdentityInvite.findMany({
        where: { tenantId, childId, target: "GUARDIAN" },
        select: {
          id: true,
          expiresAt: true,
          acceptedAt: true,
          revokedAt: true,
          invitedEmail: true,
          invitedUser: { select: { email: true } },
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

  async resendGuardianInvite(
    tenantId: string,
    orgId: string,
    actorUserId: string,
    inviteId: string,
    reviewBasis: GuardianInviteReviewBasis,
    confirmedLegalAccess: boolean,
  ): Promise<GuardianInviteSummary> {
    this.requireLegalAccessConfirmation(confirmedLegalAccess);
    const result = await withTenantRlsContext(tenantId, orgId, async (tx) => {
      await lockFamilyInvite(tx, tenantId, inviteId);
      const invite = await tx.familyIdentityInvite.findFirst({
        where: { id: inviteId, tenantId, target: "GUARDIAN" },
        include: { invitedUser: { select: { email: true, isActive: true } } },
      });
      if (!invite) throw new NotFoundException("Invitation not found");
      if (
        invite.acceptedAt ||
        invite.revokedAt ||
        !invite.invitedUser.isActive ||
        !invite.childId
      ) {
        throw new ConflictException("Invitation is no longer pending");
      }
      const site = await tx.tenant.findFirst({
        where: { id: tenantId, orgId },
        select: { name: true },
      });
      const email = invite.invitedEmail ?? invite.invitedUser.email;
      if (!site || !email) {
        throw new NotFoundException("Invitation not found");
      }
      const updated = await tx.familyIdentityInvite.update({
        where: { id_tenantId: { id: inviteId, tenantId } },
        data: { expiresAt: new Date(Date.now() + inviteLifetimeMs) },
      });
      await auditFamilyInvite(
        tx,
        tenantId,
        orgId,
        actorUserId,
        inviteId,
        "resend",
        {
          childId: invite.childId,
          reviewBasis,
          legalAccess: "reconfirmed",
        },
      );
      return {
        invite: updated,
        email,
        siteName: site.name,
      };
    });
    await this.send(result.email, result.siteName, tenantId, inviteId);
    return this.summary(result.invite, result.email);
  }

  private requireLegalAccessConfirmation(confirmed: boolean): void {
    if (!confirmed) {
      throw new BadRequestException(
        "School confirmation of guardian legal access is required",
      );
    }
  }

  async revokeGuardianInvite(
    tenantId: string,
    orgId: string,
    actorUserId: string,
    inviteId: string,
  ): Promise<{ id: string; revokedAt: Date }> {
    return withTenantRlsContext(tenantId, orgId, async (tx) => {
      await lockFamilyInvite(tx, tenantId, inviteId);
      const invite = await tx.familyIdentityInvite.findFirst({
        where: { id: inviteId, tenantId, target: "GUARDIAN" },
        select: { acceptedAt: true, revokedAt: true },
      });
      if (!invite) throw new NotFoundException("Invitation not found");
      if (invite.acceptedAt) {
        throw new ConflictException("Revoke guardian access instead");
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
      `/family-invites/${encodeURIComponent(tenantId)}/${encodeURIComponent(inviteId)}`,
      baseUrl,
    ).toString();
    try {
      await this.mailer.sendFamilyInviteEmail({
        to: email,
        siteName,
        inviteUrl,
      });
    } catch {
      this.logger.error("Family invitation email delivery failed");
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
  ): GuardianInviteSummary {
    return {
      id: invite.id,
      email,
      expiresAt: invite.expiresAt,
      acceptedAt: invite.acceptedAt,
      revokedAt: invite.revokedAt,
    };
  }
}
