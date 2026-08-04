import { Inject, Injectable, UnauthorizedException, forwardRef } from "@nestjs/common";
import { Prisma, prisma } from "@pathway/db";
import type { UpsertIdentityDto } from "./dto/upsert-identity.dto";
import { InvitesService } from "../invites/invites.service";

type IdentityWithUser = Prisma.UserIdentityGetPayload<{
  include: { user: true };
}>;

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
   * Upsert a user + identity given a verified provider principal.
   * Called from NextAuth/Clerk (admin app) via the internal endpoint and
   * also by AuthUserGuard when JIT-provisioning on a verified token that
   * doesn't yet have a linked UserIdentity.
   *
   * Resolution order (see docs/auth-migration/identity-data-map.md):
   *   1. (provider, subject) already linked -> that user
   *   2. externalId asserted on the token -> that internal User.id
   *   3. email match, only when the token asserts the email is verified
   *      AND exactly one User matches (never merge ambiguous accounts)
   *   4. create a new user
   */
  async upsertFromProvider(payload: UpsertIdentityDto): Promise<UpsertResult> {
    const { provider, subject, email, emailVerified, name, externalId } =
      payload;
    if (!provider || !subject) {
      throw new UnauthorizedException("Missing provider or subject");
    }

    const normalizedEmail = email?.trim().toLowerCase();
    const safeName = name?.trim() && !isEmail(name) ? name.trim() : null;

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
      return this.touchExistingIdentity(identity, normalizedEmail, safeName);
    }

    const user = await this.resolveOrCreateUser(
      normalizedEmail,
      emailVerified,
      safeName,
      externalId,
    );

    await this.linkIdentity(user.id, provider, subject, normalizedEmail, safeName);

    if (safeName && !user.name?.trim() && !user.displayName?.trim()) {
      await prisma.user.update({
        where: { id: user.id },
        data: { name: safeName, displayName: safeName },
      });
    }

    if (!user.firstLoginAt) {
      await prisma.user.update({
        where: { id: user.id },
        data: { firstLoginAt: new Date() },
      });
    }

    // Only accept invites when the asserted email is actually this user's
    // email in our DB - resolveOrCreateUser deliberately leaves it unset
    // when it collides with a different, already-linked account, and an
    // invite is itself a grant of org/site access that must follow the same
    // verified-email rule as identity linking.
    if (normalizedEmail && normalizedEmail === user.email) {
      try {
        await this.invitesService.acceptPendingInvitesByEmail(
          normalizedEmail,
          user.id,
        );
      } catch (err) {
        console.error("[AUTH] Failed to auto-accept pending invites:", err);
      }
    }

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

  private async touchExistingIdentity(
    identity: IdentityWithUser,
    normalizedEmail: string | undefined,
    safeName: string | null,
  ): Promise<UpsertResult> {
    const updates: {
      email?: string | null;
      displayName?: string | null;
      name?: string | null;
      firstLoginAt?: Date | null;
    } = {};
    if (normalizedEmail && identity.user.email !== normalizedEmail) {
      updates.email = normalizedEmail;
    }

    if (!identity.user.firstLoginAt) {
      updates.firstLoginAt = new Date();
    }

    if (safeName) {
      const currentDisplayName = identity.user.displayName?.trim();
      if (!currentDisplayName || currentDisplayName === identity.user.email) {
        updates.displayName = safeName;
      }
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

    const safeDisplayName =
      safeName ??
      (identity.user.displayName && !isEmail(identity.user.displayName)
        ? identity.user.displayName
        : identity.user.name && !isEmail(identity.user.name)
          ? identity.user.name
          : null);

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

  private async resolveOrCreateUser(
    normalizedEmail: string | undefined,
    emailVerified: boolean | undefined,
    safeName: string | null,
    externalId: string | undefined,
  ) {
    if (externalId) {
      const byExternalId = await prisma.user.findUnique({
        where: { id: externalId },
      });
      if (byExternalId) return byExternalId;
    }

    const matches = normalizedEmail
      ? await prisma.user.findMany({
          where: { email: { equals: normalizedEmail, mode: "insensitive" } },
          take: 2,
        })
      : [];

    // Only link when the email is verified and unambiguous - never
    // auto-merge accounts that happen to share an address.
    if (normalizedEmail && emailVerified && matches.length === 1) {
      return matches[0];
    }

    // User.email is unique. If the email already belongs to an account we
    // just decided not to link (unverified or ambiguous), the new user must
    // not carry it too - that would either violate the constraint or, worse,
    // silently attach an unverified identity's data to someone else's email.
    const emailForNewUser = matches.length > 0 ? undefined : normalizedEmail;

    return prisma.user.create({
      data: {
        email: emailForNewUser,
        name: safeName ?? null,
        displayName: safeName ?? null,
        firstLoginAt: new Date(),
      },
    });
  }

  private async linkIdentity(
    userId: string,
    provider: string,
    subject: string,
    normalizedEmail: string | undefined,
    safeName: string | null,
  ): Promise<void> {
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
          userId,
          provider,
          providerSubject: subject,
          email: normalizedEmail,
          displayName: safeName ?? null,
        },
      });
    } else if (existingIdentity.userId !== userId) {
      await prisma.userIdentity.update({
        where: {
          provider_providerSubject: { provider, providerSubject: subject },
        },
        data: {
          userId,
          email: normalizedEmail,
          displayName: safeName ?? null,
        },
      });
    }
  }
}
