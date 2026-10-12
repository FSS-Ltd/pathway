import { Injectable, Logger } from "@nestjs/common";
import { createClerkClient, type ClerkClient } from "@clerk/backend";

/**
 * Service for interacting with the Clerk Backend API.
 * Used to create users programmatically during invites and purchases,
 * mirroring Auth0ManagementService's shape and soft-fail behaviour so
 * callers (invites, billing webhook, public signup) can migrate with a
 * one-line swap. Never verifies passwords - Clerk has no Resource Owner
 * Password equivalent; see docs/auth-migration for the sign-in redesign.
 */
@Injectable()
export class ClerkManagementService {
  private readonly logger = new Logger(ClerkManagementService.name);
  private readonly client: ClerkClient | null;
  private readonly isConfigured: boolean;

  constructor() {
    const secretKey = process.env.CLERK_SECRET_KEY;
    this.isConfigured = Boolean(secretKey);
    this.client = secretKey ? createClerkClient({ secretKey }) : null;

    if (!this.isConfigured) {
      this.logger.warn(
        "Clerk secret key not configured. User creation will be skipped.",
      );
    }
  }

  isReady(): boolean {
    return this.isConfigured;
  }

  /**
   * Create a user in Clerk. `externalId` should be the internal User.id so
   * AuthUserGuard/AuthIdentityService can resolve this account authoritatively
   * on first sign-in, without depending on email matching.
   *
   * `password` is optional: omit it to pre-create a passwordless account
   * (the user resets on first Clerk sign-in - see the "no passwords"
   * migration decision), or pass one when the user already chose a password
   * in our own form (invites use no password; purchase/signup forms that
   * collect one can pass it straight through - Clerk supports this natively,
   * unlike Auth0's Resource Owner Password grant).
   */
  async createUser(params: {
    email: string;
    name?: string;
    password?: string;
    externalId?: string;
  }): Promise<string | null> {
    if (!this.client) {
      this.logger.warn(
        "Cannot create Clerk user: Backend API client unavailable",
      );
      return null;
    }

    const [firstName, ...rest] = (params.name ?? "").trim().split(/\s+/);
    const lastName = rest.join(" ") || undefined;

    try {
      const user = await this.client.users.createUser({
        emailAddress: [params.email.toLowerCase().trim()],
        password: params.password,
        skipPasswordRequirement: !params.password,
        firstName: firstName || undefined,
        lastName,
        externalId: params.externalId,
        privateMetadata: { migrationVersion: "auth0-clerk-v1" },
      });
      this.logger.log(`Created Clerk user: ${params.email} (${user.id})`);
      return user.id;
    } catch (error) {
      this.logger.error("Error creating Clerk user:", error);
      // Mirror Auth0ManagementService's 409 handling: a user with this email
      // may already exist (e.g. a re-run after a partial earlier failure).
      const existing = await this.getUserByEmail(params.email);
      if (existing) return existing;
      return null;
    }
  }

  /** Get a user by email address. Returns the Clerk user id if found. */
  async getUserByEmail(email: string): Promise<string | null> {
    if (!this.client) return null;

    try {
      const { data } = await this.client.users.getUserList({
        emailAddress: [email.toLowerCase().trim()],
      });
      return data[0]?.id ?? null;
    } catch (error) {
      this.logger.error("Error getting Clerk user by email:", error);
      return null;
    }
  }

  /**
   * Backfill externalId on a Clerk user created client-side (e.g. the
   * inverted nexsteps-home signup flow, where Clerk creates the account
   * before our internal User row exists).
   */
  async setExternalId(clerkUserId: string, internalUserId: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.users.updateUser(clerkUserId, {
        externalId: internalUserId,
      });
    } catch (error) {
      this.logger.error("Error setting externalId on Clerk user:", error);
    }
  }
}
