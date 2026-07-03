import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  Inject,
} from "@nestjs/common";
import { prisma, OrgRole, SiteRole, Role, Prisma } from "@pathway/db";
import { createHash, randomBytes } from "crypto";
import type { CreateInviteDto } from "./dto/create-invite.dto";
import { MailerService } from "../mailer/mailer.service";
import { Auth0ManagementService } from "../auth/auth0-management.service";

type InviteSummary = {
  id: string;
  email: string;
  orgRole?: OrgRole | null;
  siteAccessMode?: "ALL_SITES" | "SELECT_SITES" | null;
  siteCount?: number;
  siteRole?: SiteRole | null;
  expiresAt: Date;
  usedAt?: Date | null;
  revokedAt?: Date | null;
  lastSentAt?: Date | null;
  status: "pending" | "used" | "expired" | "revoked";
};

type ActiveSiteState = {
  activeSiteId: string | null;
  orgId: string;
  sites: Array<{ id: string; name: string; orgName?: string | null }>;
};

@Injectable()
export class InvitesService {
  constructor(
    @Inject(MailerService) private readonly mailerService: MailerService,
    @Inject(Auth0ManagementService)
    private readonly auth0Management: Auth0ManagementService,
  ) {}

  /**
   * Create a new invite for a user to join an Org and optionally specific Sites.
   */
  async createInvite(
    orgId: string,
    createdByUserId: string,
    dto: CreateInviteDto,
  ): Promise<InviteSummary> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // Generate secure random token
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = this.hashToken(rawToken);

    // Determine site access
    let siteIdsJson: string | null = null;
    const siteRole: SiteRole | null = dto.siteAccess?.role ?? null;

    if (dto.siteAccess) {
      if (dto.siteAccess.mode === "SELECT_SITES") {
        if (!dto.siteAccess.siteIds || dto.siteAccess.siteIds.length === 0) {
          throw new BadRequestException(
            "At least one site must be selected for SELECT_SITES mode",
          );
        }
        siteIdsJson = JSON.stringify(dto.siteAccess.siteIds);
      } else if (dto.siteAccess.mode === "ALL_SITES") {
        // For ALL_SITES, we don't store specific IDs
        siteIdsJson = JSON.stringify([]);
      }
    }

    // Check for existing active invite for this (orgId, email)
    const existingInvite = await prisma.invite.findFirst({
      where: {
        orgId,
        email: normalizedEmail,
        usedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (existingInvite) {
      // Revoke the old one and create a new one
      await prisma.invite.update({
        where: { id: existingInvite.id },
        data: { revokedAt: new Date() },
      });
    }

    // Create new invite
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

    // Note: name field added to schema - Prisma client needs regeneration after migration
    // Using type assertion via unknown to work around Prisma client type mismatch until regeneration
    const invite = await prisma.invite.create({
      data: {
        orgId,
        createdByUserId,
        email: normalizedEmail,
        name: dto.name?.trim() || null,
        orgRole: dto.orgRole ?? null,
        siteIdsJson,
        siteRole,
        tokenHash,
        expiresAt,
        lastSentAt: new Date(),
      } as unknown as Prisma.InviteCreateInput,
      include: {
        org: { select: { name: true } },
        createdBy: { select: { name: true, displayName: true } },
      },
    });

    // Create user in DB and Auth0 if they don't exist
    await this.ensureUserExistsForInvite(normalizedEmail, dto.name?.trim() || null);

    // Send invite email (admin app URL; app subdomain in prod and local Caddy)
    const baseUrl =
      process.env.ADMIN_URL ||
      (process.env.NODE_ENV === "production"
        ? "https://app.nexsteps.dev"
        : "https://app.localhost:3000");
    const inviteUrl = `${baseUrl}/accept-invite?token=${rawToken}`;
    const invitedByName =
      invite.createdBy.displayName || invite.createdBy.name || "A team member";

    try {
      await this.mailerService.sendInviteEmail({
        to: normalizedEmail,
        inviteUrl,
        orgName: invite.org.name,
        invitedByName,
      });
    } catch (error) {
      console.error(`[INVITE] ❌ Failed to send email to ${normalizedEmail}:`, error);
      // Don't fail the invite creation if email fails
    }

    return this.toSummary(invite);
  }

  /**
   * Ensure a user exists in DB and Auth0 for an invite.
   * Creates the user if they don't exist, using a temporary password.
   */
  private async ensureUserExistsForInvite(
    email: string,
    name: string | null,
  ): Promise<void> {
    try {
      // Check if user already exists in DB
      const existingUser = await prisma.user.findFirst({
        where: {
          email: { equals: email, mode: "insensitive" },
        },
      });

      if (existingUser) {
        // User exists in DB, check if they have Auth0 identity
        const existingIdentity = await prisma.userIdentity.findFirst({
          where: {
            userId: existingUser.id,
            provider: "auth0",
          },
        });

        if (existingIdentity) {
          // User already has Auth0 account, nothing to do
          return;
        }

        // User exists in DB but no Auth0 identity - create Auth0 user
        const safeName = name && !name.includes("@") ? name : null;
        const tempPassword = randomBytes(32).toString("hex"); // Temporary password
        const auth0UserId = await this.auth0Management.createUser({
          email,
          password: tempPassword,
          name: safeName || email,
          emailVerified: false, // They'll verify via password reset
        });

        if (auth0UserId) {
          // Link Auth0 identity to existing user
          await prisma.userIdentity.create({
            data: {
              userId: existingUser.id,
              provider: "auth0",
              providerSubject: auth0UserId,
              email,
              displayName: safeName,
            },
          });
        }
        return;
      }

      // User doesn't exist - create in DB first
      const safeName = name && !name.includes("@") ? name : null;
      const newUser = await prisma.user.create({
        data: {
          email,
          name: safeName,
          displayName: safeName,
        },
      });

      // Create Auth0 user
      const tempPassword = randomBytes(32).toString("hex"); // Temporary password
      const auth0UserId = await this.auth0Management.createUser({
        email,
        password: tempPassword,
        name: safeName || email,
        emailVerified: false, // They'll verify via password reset
      });

      if (auth0UserId) {
        // Link Auth0 identity
        await prisma.userIdentity.create({
          data: {
            userId: newUser.id,
            provider: "auth0",
            providerSubject: auth0UserId,
            email,
            displayName: safeName,
          },
        });
      } else {
        console.warn(
          `[INVITE] ⚠️ Created user ${email} in DB but failed to create Auth0 account. User will need to sign up manually.`,
        );
      }
    } catch (error) {
      // Don't fail invite creation if user creation fails
      console.error(
        `[INVITE] ❌ Error ensuring user exists for invite ${email}:`,
        error,
      );
    }
  }

  /**
   * Resend an existing invite (generates new token).
   */
  async resendInvite(
    orgId: string,
    inviteId: string,
  ): Promise<InviteSummary> {
    const invite = await prisma.invite.findFirst({
      where: { id: inviteId, orgId },
    });

    if (!invite) {
      throw new NotFoundException("Invite not found");
    }

    if (invite.usedAt) {
      throw new BadRequestException("Invite already used");
    }

    if (invite.revokedAt) {
      throw new BadRequestException("Invite has been revoked");
    }

    // Generate new token
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = this.hashToken(rawToken);

    const updated = await prisma.invite.update({
      where: { id: inviteId },
      data: {
        tokenHash,
        lastSentAt: new Date(),
        // Optionally extend expiry
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
      include: {
        org: { select: { name: true } },
        createdBy: { select: { name: true, displayName: true } },
      },
    });

    // Resend invite email (admin app URL; app subdomain in prod and local Caddy)
    const baseUrl =
      process.env.ADMIN_URL ||
      (process.env.NODE_ENV === "production"
        ? "https://app.nexsteps.dev"
        : "https://app.localhost:3000");
    const inviteUrl = `${baseUrl}/accept-invite?token=${rawToken}`;
    const invitedByName =
      updated.createdBy.displayName || updated.createdBy.name || "A team member";

    try {
      await this.mailerService.sendInviteEmail({
        to: updated.email,
        inviteUrl,
        orgName: updated.org.name,
        invitedByName,
      });
    } catch (error) {
      console.error(`[INVITE] ❌ Failed to resend email to ${updated.email}:`, error);
      // Don't fail the resend if email fails
    }

    return this.toSummary(updated);
  }

  /**
   * Revoke an invite.
   */
  async revokeInvite(orgId: string, inviteId: string): Promise<InviteSummary> {
    const invite = await prisma.invite.findFirst({
      where: { id: inviteId, orgId },
    });

    if (!invite) {
      throw new NotFoundException("Invite not found");
    }

    const updated = await prisma.invite.update({
      where: { id: inviteId },
      data: { revokedAt: new Date() },
    });

    return this.toSummary(updated);
  }

  /**
   * List invites for an Org, optionally filtered by status.
   */
  async listInvites(
    orgId: string,
    status?: "pending" | "used" | "expired" | "revoked",
  ): Promise<InviteSummary[]> {
    try {
      const now = new Date();
      let where: Prisma.InviteWhereInput = { orgId };

      if (status === "pending") {
        where = {
          ...where,
          usedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        };
      } else if (status === "used") {
        where = { ...where, usedAt: { not: null } };
      } else if (status === "expired") {
        where = {
          ...where,
          usedAt: null,
          revokedAt: null,
          expiresAt: { lte: now },
        };
      } else if (status === "revoked") {
        where = { ...where, revokedAt: { not: null } };
      }

      const invites = await prisma.invite.findMany({
        where,
        orderBy: { createdAt: "desc" },
      });

      // For "pending": exclude invites where user has logged in (UserIdentity)
      // Those users appear in People instead
      let filteredInvites = invites;
      if (status === "pending" && invites.length > 0) {
        const inviteEmails = [...new Set(invites.map((i) => i.email.toLowerCase()))];
        const emailsWithIdentity = await prisma.user.findMany({
          where: {
            OR: inviteEmails.map((email) => ({
              email: { equals: email, mode: "insensitive" as const },
            })),
            identities: { some: {} },
          },
          select: { email: true },
        });
        const loggedInEmails = new Set(
          emailsWithIdentity.map((u) => (u.email ?? "").toLowerCase()),
        );
        filteredInvites = invites.filter(
          (inv) => !loggedInEmails.has(inv.email.toLowerCase()),
        );
      }

      return filteredInvites.map((inv) => this.toSummary(inv));
    } catch (error) {
      console.error("[INVITES] listInvites error:", error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Accept pending invites by email on first login.
   * Called from AuthIdentityService when a user logs in - auto-applies any pending
   * invites for their email so they get org/site access even if they missed the accept-invite page.
   */
  async acceptPendingInvitesByEmail(
    email: string,
    userId: string,
  ): Promise<void> {
    const normalizedEmail = email?.trim().toLowerCase();
    if (!normalizedEmail) return;

    const now = new Date();
    const pendingInvites = await prisma.invite.findMany({
      where: {
        email: normalizedEmail,
        usedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      include: { org: true },
    });

    if (pendingInvites.length === 0) return;

    for (const invite of pendingInvites) {
      try {
        await this.applyInviteMemberships(
          invite as Prisma.InviteGetPayload<{ include: { org: true } }> & {
            name?: string | null;
          },
          userId,
          normalizedEmail,
        );
      } catch (err) {
        console.error("[INVITE] Failed to auto-accept invite:", invite.id, err);
        // Continue with other invites
      }
    }
  }

  /**
   * Accept an invite by token. This creates memberships and returns accessible sites.
   */
  async acceptInvite(
    token: string,
    userId: string,
    userEmail: string,
  ): Promise<ActiveSiteState> {
    const tokenHash = this.hashToken(token);

    const invite = await prisma.invite.findUnique({
      where: { tokenHash },
      include: { org: true },
    });

    if (!invite) {
      throw new NotFoundException("Invalid invite token");
    }

    if (invite.usedAt) {
      throw new BadRequestException("Invite has already been used");
    }

    if (invite.revokedAt) {
      throw new BadRequestException("Invite has been revoked");
    }

    if (invite.expiresAt < new Date()) {
      throw new BadRequestException("Invite has expired");
    }

    // Verify email match
    const normalizedUserEmail = userEmail.trim().toLowerCase();
    if (normalizedUserEmail !== invite.email) {
      throw new UnauthorizedException(
        `Invite is for ${invite.email}, but you are signed in as ${normalizedUserEmail}`,
      );
    }

    return this.applyInviteMemberships(
      invite as Prisma.InviteGetPayload<{ include: { org: true } }> & {
        name?: string | null;
      },
      userId,
      normalizedUserEmail,
    );
  }

  /**
   * Apply invite memberships: create OrgMembership, SiteMemberships, mark invite used.
   * Shared by acceptInvite (token flow) and acceptPendingInvitesByEmail (login flow).
   */
  private async applyInviteMemberships(
    invite: Prisma.InviteGetPayload<{ include: { org: true } }> & {
      name?: string | null;
    },
    userId: string,
    normalizedUserEmail: string,
  ): Promise<ActiveSiteState> {
    const { orgId, orgRole, siteIdsJson, siteRole, name: inviteName } = invite;

    // Update user name from invite if provided and user doesn't have a name yet
    if (inviteName?.trim()) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, displayName: true },
      });

      if (user) {
        const updates: { name?: string; displayName?: string } = {};
        if (!user.name?.trim()) {
          updates.name = inviteName.trim();
        }
        const currentDisplayName = user.displayName?.trim();
        if (!currentDisplayName || currentDisplayName === normalizedUserEmail) {
          updates.displayName = inviteName.trim();
        }
        if (Object.keys(updates).length > 0) {
          await prisma.user.update({
            where: { id: userId },
            data: updates,
          });
        }
      }
    }

    // 1. Org membership
    // Always create at least ORG_MEMBER if no role specified
    const effectiveOrgRole = orgRole || OrgRole.ORG_MEMBER;

    await prisma.orgMembership.upsert({
      where: {
        orgId_userId: { orgId, userId },
      },
      create: {
        orgId,
        userId,
        role: effectiveOrgRole,
      },
      update: {
        // Don't downgrade if user already has a higher role
        role: effectiveOrgRole,
      },
    });

    // 1b. Create UserOrgRole record (for backward compatibility with older role checks)
    // Map OrgRole enum directly (they use the same enum values)
    if (effectiveOrgRole) {
      try {
        // Check if record already exists
        const existing = await prisma.userOrgRole.findFirst({
          where: {
            userId,
            orgId,
            role: effectiveOrgRole,
          },
        });

        if (!existing) {
          await prisma.userOrgRole.create({
            data: {
              userId,
              orgId,
              role: effectiveOrgRole,
            },
          });
        }
      } catch (err) {
        // Ignore duplicate errors (P2002)
        const code =
          typeof err === "object" && err !== null && "code" in err
            ? String((err as { code?: unknown }).code)
            : undefined;
        if (code !== "P2002") {
          console.error("[INVITE-ACCEPT] Failed to create UserOrgRole:", err);
        }
      }
    }

    // 2. Site memberships
    let siteIds: string[] = [];
    if (siteIdsJson) {
      try {
        const parsed = JSON.parse(siteIdsJson);
        if (Array.isArray(parsed) && parsed.length > 0) {
          siteIds = parsed;
        } else {
          // ALL_SITES mode (empty array) - get all sites for this org
          const allSites = await prisma.tenant.findMany({
            where: { orgId },
            select: { id: true },
          });
          siteIds = allSites.map((s) => s.id);
        }
      } catch (err) {
        console.error("[INVITE-ACCEPT] Failed to parse siteIdsJson:", err);
      }
    } else {
      // No site access specified - give access to all sites with STAFF role by default
      const allSites = await prisma.tenant.findMany({
        where: { orgId },
        select: { id: true },
      });
      siteIds = allSites.map((s) => s.id);
    }

    // Always create site memberships - default to STAFF if no role specified
    const effectiveSiteRole = siteRole || SiteRole.STAFF;

    if (siteIds.length > 0) {
      for (const siteId of siteIds) {
        await prisma.siteMembership.upsert({
          where: {
            tenantId_userId: { tenantId: siteId, userId },
          },
          create: {
            tenantId: siteId,
            userId,
            role: effectiveSiteRole,
          },
          update: {
            // Optionally update role
            role: effectiveSiteRole,
          },
        });

        // 2b. Create UserTenantRole record (for backward compatibility with older role checks)
        // Map SiteRole to Role enum
        const tenantRole = this.mapSiteRoleToRole(effectiveSiteRole);
        if (tenantRole) {
          try {
            // Check if record already exists
            const existing = await prisma.userTenantRole.findFirst({
              where: {
                userId,
                tenantId: siteId,
                role: tenantRole,
              },
            });

            if (!existing) {
              await prisma.userTenantRole.create({
                data: {
                  userId,
                  tenantId: siteId,
                  role: tenantRole,
                },
              });
            }
          } catch (err) {
            // Ignore duplicate errors (P2002)
            const code =
              typeof err === "object" && err !== null && "code" in err
                ? String((err as { code?: unknown }).code)
                : undefined;
            if (code !== "P2002") {
              console.error("[INVITE-ACCEPT] Failed to create UserTenantRole:", err);
            }
          }
        }
      }
    } else {
      console.warn("[INVITE-ACCEPT] ⚠️  No sites found in org - user will have no site access!");
    }

    // Mark invite as used
    await prisma.invite.update({
      where: { id: invite.id },
      data: { usedAt: new Date() },
    });

    // Determine accessible sites
    const accessibleSites = await prisma.tenant.findMany({
      where: {
        OR: [
          { siteMemberships: { some: { userId } } },
          // Org admins get access to all sites in org
          {
            orgId,
            org: { orgMemberships: { some: { userId, role: { in: [OrgRole.ORG_ADMIN] } } } },
          },
        ],
      },
      select: { id: true, name: true, org: { select: { name: true } } },
    });

    const sites = accessibleSites.map((s) => ({
      id: s.id,
      name: s.name,
      orgName: s.org.name,
    }));

    // Auto-select site if only one
    let activeSiteId: string | null = null;
    if (sites.length === 1) {
      activeSiteId = sites[0]!.id;
      await prisma.user.update({
        where: { id: userId },
        data: { lastActiveTenantId: activeSiteId },
      });
    }

    return {
      activeSiteId,
      orgId,
      sites,
    };
  }

  /**
   * Map SiteRole to Role enum for UserTenantRole table
   */
  private mapSiteRoleToRole(siteRole: SiteRole): Role | null {
    switch (siteRole) {
      case SiteRole.SITE_ADMIN:
        return Role.ADMIN;
      case SiteRole.STAFF:
        return Role.TEACHER; // STAFF maps to TEACHER in legacy Role enum
      case SiteRole.VIEWER:
        return Role.PARENT; // VIEWER maps to PARENT in legacy Role enum
      default:
        return null;
    }
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private toSummary(
    invite: (Prisma.InviteGetPayload<Record<string, never>> | Prisma.InviteGetPayload<{ include: { org: true; createdBy: true } }>) & { name?: string | null },
  ): InviteSummary {
    let siteAccessMode: "ALL_SITES" | "SELECT_SITES" | null = null;
    let siteCount = 0;

    if (invite.siteIdsJson) {
      try {
        const parsed = JSON.parse(invite.siteIdsJson);
        if (Array.isArray(parsed)) {
          if (parsed.length === 0) {
            siteAccessMode = "ALL_SITES";
          } else {
            siteAccessMode = "SELECT_SITES";
            siteCount = parsed.length;
          }
        }
      } catch {
        // ignore
      }
    }

    // Determine status
    let status: "pending" | "used" | "expired" | "revoked" = "pending";
    if (invite.revokedAt) {
      status = "revoked";
    } else if (invite.usedAt) {
      status = "used";
    } else if (invite.expiresAt < new Date()) {
      status = "expired";
    }

    return {
      id: invite.id,
      email: invite.email,
      orgRole: invite.orgRole,
      siteAccessMode,
      siteCount,
      siteRole: invite.siteRole,
      expiresAt: invite.expiresAt,
      usedAt: invite.usedAt,
      revokedAt: invite.revokedAt,
      lastSentAt: invite.lastSentAt,
      status,
    };
  }
}
