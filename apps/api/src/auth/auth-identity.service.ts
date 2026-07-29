import { Inject, Injectable, UnauthorizedException, forwardRef } from "@nestjs/common";
import { prisma } from "@pathway/db";
import type { DecodedAuthToken } from "./auth-token.util";
import type { UpsertIdentityDto } from "./dto/upsert-identity.dto";
import { InvitesService } from "../invites/invites.service";

type UpsertResult = {
  userId: string;
  email?: string | null;
  displayName?: string | null;
};

/**
 * Check if a string looks like an email address.
 */
function isEmail(value: string | null | undefined): boolean {
  if (!value || typeof value !== "string") return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(value.trim());
}

@Injectable()
export class AuthIdentityService {
  constructor(
    @Inject(forwardRef(() => InvitesService))
    private readonly invitesService: InvitesService,
  ) {}

  /**
   * Upsert a user + identity given Auth0 profile data.
   * This is called from NextAuth (admin app) via the internal endpoint and also
   * by API guards when handling Auth0 access tokens directly.
   */
  async upsertFromAuth0(payload: UpsertIdentityDto): Promise<UpsertResult> {
    const { provider, subject, email, name } = payload;
    if (!provider || !subject) {
      throw new UnauthorizedException("Missing provider or subject");
    }

    const normalizedEmail = email?.trim().toLowerCase();

    const identity = await prisma.userIdentity.findUnique({
      where: {
        provider_providerSubject: {
          provider,
          providerSubject: subject,
        },
      },
      include: { user: true },
    });

    if (identity?.user) {
      const updates: {
        email?: string | null;
        displayName?: string | null;
        name?: string | null;
        firstLoginAt?: Date | null;
      } = {};
      if (normalizedEmail && identity.user.email !== normalizedEmail) {
        updates.email = normalizedEmail;
      }
      
      // Track first login if not already set
      if (!identity.user.firstLoginAt) {
        updates.firstLoginAt = new Date();
      }
      
      // Only update displayName if name is provided and is NOT an email
      // Don't overwrite a good displayName with an email
      const safeName = name?.trim() && !isEmail(name) ? name.trim() : null;
      if (safeName) {
        const currentDisplayName = identity.user.displayName?.trim();
        // Only update if displayName is missing, empty, or equals email (auto-generated)
        if (!currentDisplayName || currentDisplayName === identity.user.email) {
          updates.displayName = safeName;
        }
        // Also update name field if it's missing
        if (!identity.user.name?.trim()) {
          updates.name = safeName;
        }
      }

      if (Object.keys(updates).length > 0) {
        await prisma.user.update({
          where: { id: identity.userId },
          data: updates,
        });
      }

      // Return safe display name using fallback logic
      const safeDisplayName =
        safeName ??
        (identity.user.displayName && !isEmail(identity.user.displayName)
          ? identity.user.displayName
          : identity.user.name && !isEmail(identity.user.name)
            ? identity.user.name
            : null);

      // Auto-accept any pending invites on login (e.g. user missed accept-invite page)
      if (normalizedEmail) {
        void this.invitesService
          .acceptPendingInvitesByEmail(normalizedEmail, identity.userId)
          .catch((err) =>
            console.error("[AUTH] Failed to auto-accept pending invites:", err),
          );
      }

      return {
        userId: identity.userId,
        email: normalizedEmail ?? identity.user.email,
        displayName: safeDisplayName,
      };
    }

    // Attempt to link by verified email when possible.
    const existingUser = normalizedEmail
      ? await prisma.user.findFirst({
          where: {
            email: { equals: normalizedEmail, mode: "insensitive" },
          },
        })
      : null;

    // Only use name if it's not an email
    const safeName = name?.trim() && !isEmail(name) ? name.trim() : null;

    const user = existingUser
      ? existingUser
      : await prisma.user.create({
          data: {
            email: normalizedEmail,
            name: safeName ?? null,
            displayName: safeName ?? null,
            firstLoginAt: new Date(), // Mark first login for new users
          },
        });

    // Check if identity already exists (shouldn't happen, but handle gracefully)
    const existingIdentity = await prisma.userIdentity.findUnique({
      where: {
        provider_providerSubject: {
          provider,
          providerSubject: subject,
        },
      },
    });

    if (!existingIdentity) {
      await prisma.userIdentity.create({
        data: {
          userId: user.id,
          provider,
          providerSubject: subject,
          email: normalizedEmail,
          displayName: safeName ?? null,
        },
      });
    } else if (existingIdentity.userId !== user.id) {
      // Identity exists but linked to different user - update it
      await prisma.userIdentity.update({
        where: {
          provider_providerSubject: {
            provider,
            providerSubject: subject,
          },
        },
        data: {
          userId: user.id,
          email: normalizedEmail,
          displayName: safeName ?? null,
        },
      });
    }

    // Update user name if provided and user doesn't have one
    if (safeName && !user.name?.trim() && !user.displayName?.trim()) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          name: safeName,
          displayName: safeName,
        },
      });
    }

    // Track first login if not already set
    if (!user.firstLoginAt) {
      await prisma.user.update({
        where: { id: user.id },
        data: { firstLoginAt: new Date() },
      });
    }

    // Auto-accept pending invites on login (creates memberships, marks used)
    if (normalizedEmail) {
      try {
        await this.invitesService.acceptPendingInvitesByEmail(
          normalizedEmail,
          user.id,
        );
      } catch (err) {
        console.error("[AUTH] Failed to auto-accept pending invites:", err);
      }
    }

    // Return safe display name using fallback logic
    const safeDisplayName =
      safeName ??
      (user.displayName && !isEmail(user.displayName)
        ? user.displayName
        : user.name && !isEmail(user.name)
          ? user.name
          : null);

    return {
      userId: user.id,
      email: normalizedEmail ?? user.email,
      displayName: safeDisplayName,
    };
  }

  async resolveUserFromClaims(
    claims: DecodedAuthToken,
  ): Promise<UpsertResult & { provider: string; subject: string }> {
    const provider = claims.iss?.includes("auth0") ? "auth0" : "debug";
    const subject = claims.sub;
    if (!subject) {
      throw new UnauthorizedException("Missing sub in token");
    }
    const userClaims = claims["https://pathway.app/user"] as
      | {
          email?: string;
          name?: string;
          givenName?: string;
          familyName?: string;
        }
      | undefined;
    const email = claims.email ?? userClaims?.email;
    const name =
      claims.name ??
      userClaims?.givenName ??
      userClaims?.name ??
      [claims.given_name, claims.family_name, userClaims?.familyName]
        .filter(Boolean)
        .join(" ")
        .trim();

    const result = await this.upsertFromAuth0({
      provider,
      subject,
      email: email ?? undefined,
      name: name || undefined,
    });

    return { ...result, provider, subject };
  }
}

