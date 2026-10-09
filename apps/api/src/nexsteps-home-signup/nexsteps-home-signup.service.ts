import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { OrgRole, Role, prisma } from "@pathway/db";
import type { VerifiedPrincipal } from "../auth/token-verifier";
import { ClerkManagementService } from "../auth/clerk-management.service";

const HOME_FREE_PLAN_CODE = "HOME_FREE";

/**
 * Creates a new NexSteps Home household: one Org per household (H1 decision -
 * see docs/NexStepsV2/07-nexsteps-home.md PR 7.4), single Tenant, the parent
 * as its sole ORG_ADMIN/SITE_ADMIN. No payment provider involved - the
 * household starts on the Free plan; upgrading happens externally via
 * nexsteps.dev (PR 7.2), not through this endpoint.
 *
 * The client authenticates with Clerk first (useSignUp() + email
 * verification) and calls this endpoint with that session's bearer token -
 * unlike the old Auth0 flow, there is no IdP write in this transaction at
 * all, so a rollback can no longer orphan an IdP account.
 */
@Injectable()
export class NexstepsHomeSignupService {
  constructor(
    @Inject(ClerkManagementService)
    private readonly clerkManagement: ClerkManagementService,
  ) {}

  async signup(
    principal: VerifiedPrincipal,
  ): Promise<{ success: true; orgId: string; tenantId: string }> {
    if (!principal.email || !principal.emailVerified) {
      throw new ForbiddenException(
        "Please verify your email before completing signup.",
      );
    }
    const email = principal.email.toLowerCase().trim();

    const existingIdentity = await prisma.userIdentity.findUnique({
      where: {
        provider_providerSubject: {
          provider: "clerk",
          providerSubject: principal.sub,
        },
      },
      include: { user: { include: { tenant: true } } },
    });
    if (existingIdentity?.user.tenant) {
      // Idempotent retry: the household was already provisioned for this
      // Clerk account, most likely after a network failure on a prior call.
      return {
        success: true,
        orgId: existingIdentity.user.tenant.orgId,
        tenantId: existingIdentity.user.tenant.id,
      };
    }

    // A UserIdentity can already exist with no tenant: AuthUserGuard
    // JIT-provisions a bare User on any authenticated request it sees for
    // an unrecognised principal (e.g. the client's own bootstrap call,
    // which can race this endpoint the instant Clerk's setActive() flips
    // isSignedIn). Adopt that identity's user rather than creating a
    // second one, which would otherwise collide on email below.
    const adoptedUserId = existingIdentity?.userId;

    if (!adoptedUserId) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        throw new ConflictException(
          "An account already exists for this email address.",
        );
      }
    }

    const householdName = this.householdNameFromEmail(email);
    const slug = await this.generateUniqueSlug(householdName);

    const { org, tenant, user } = await prisma.$transaction(async (tx) => {
      const org = await tx.org.create({
        data: {
          name: householdName,
          slug,
          planCode: HOME_FREE_PLAN_CODE,
          isSuite: false,
        },
      });

      const tenant = await tx.tenant.create({
        data: { name: householdName, slug, orgId: org.id },
      });

      await tx.orgVertical.create({
        data: { orgId: org.id, vertical: "HOME_EDUCATION" },
      });

      const user = adoptedUserId
        ? await tx.user.update({
            where: { id: adoptedUserId },
            data: { email, tenantId: tenant.id, hasFamilyAccess: true },
          })
        : await tx.user.create({
            data: { email, tenantId: tenant.id, hasFamilyAccess: true },
          });

      if (!adoptedUserId) {
        await tx.userIdentity.create({
          data: {
            userId: user.id,
            provider: "clerk",
            providerSubject: principal.sub,
            email,
          },
        });
      }

      await tx.userTenantRole.create({
        data: { userId: user.id, tenantId: tenant.id, role: Role.ADMIN },
      });

      await tx.userOrgRole.create({
        data: { userId: user.id, orgId: org.id, role: OrgRole.ORG_ADMIN },
      });

      await tx.orgMembership.create({
        data: { orgId: org.id, userId: user.id, role: OrgRole.ORG_ADMIN },
      });

      await tx.siteMembership.create({
        data: { tenantId: tenant.id, userId: user.id, role: "SITE_ADMIN" },
      });

      return { org, tenant, user };
    });

    await this.clerkManagement.setExternalId(principal.sub, user.id);

    return { success: true, orgId: org.id, tenantId: tenant.id };
  }

  private householdNameFromEmail(email: string): string {
    const localPart = email.split("@")[0] ?? "family";
    const cleaned = localPart.replace(/[^a-zA-Z0-9]+/g, " ").trim();
    const label = cleaned.length > 0 ? cleaned : "family";
    const titled = label
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
    return `${titled}'s Family`;
  }

  private async generateUniqueSlug(name: string): Promise<string> {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .substring(0, 50);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const suffix = Math.random().toString(36).substring(2, 8);
      const slug = `${base}-${suffix}`;
      const clash = await prisma.org.findUnique({ where: { slug } });
      if (!clash) return slug;
    }
    throw new ServiceUnavailableException(
      "Could not create the account. Please try again.",
    );
  }
}
