import { ConflictException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { OrgRole, Role, prisma } from "@pathway/db";
import { Auth0ManagementService } from "../auth/auth0-management.service";
import type { NexstepsHomeSignupDto } from "./dto/nexsteps-home-signup.dto";

const AUTH0_CONNECTION = "Username-Password-Authentication";
const HOME_FREE_PLAN_CODE = "HOME_FREE";

/**
 * Creates a new NexSteps Home household: one Org per household (H1 decision -
 * see docs/NexStepsV2/07-nexsteps-home.md PR 7.4), single Tenant, the parent
 * as its sole ORG_ADMIN/SITE_ADMIN. No payment provider involved - the
 * household starts on the Free plan; upgrading happens externally via
 * nexsteps.dev (PR 7.2), not through this endpoint.
 *
 * Mirrors apps/api/src/billing/webhook.controller.ts's
 * createOrgFromPendingDetails (the codebase's existing org+user+role creation
 * pattern), minus the payment-deferral wrapper that pattern needs and this
 * endpoint doesn't.
 */
@Injectable()
export class NexstepsHomeSignupService {
  constructor(private readonly auth0Management: Auth0ManagementService) {}

  async signup(
    dto: NexstepsHomeSignupDto,
  ): Promise<{ success: true; orgId: string; tenantId: string }> {
    const email = dto.email.toLowerCase().trim();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException(
        "An account already exists for this email address.",
      );
    }

    const auth0UserId = await this.auth0Management.createUser({
      email,
      password: dto.password,
      connection: AUTH0_CONNECTION,
      emailVerified: false,
    });
    if (!auth0UserId) {
      throw new ServiceUnavailableException(
        "Could not create the account. Please try again.",
      );
    }

    const householdName = this.householdNameFromEmail(email);
    const slug = await this.generateUniqueSlug(householdName);

    const { org, tenant } = await prisma.$transaction(async (tx) => {
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

      const user = await tx.user.create({
        data: { email, tenantId: tenant.id, hasFamilyAccess: true },
      });

      await tx.userIdentity.create({
        data: {
          userId: user.id,
          provider: "auth0",
          providerSubject: auth0UserId,
          email,
        },
      });

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

      return { org, tenant };
    });

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
