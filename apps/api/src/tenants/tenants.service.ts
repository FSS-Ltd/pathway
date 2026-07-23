import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { createHash, randomBytes } from "crypto";
import { prisma } from "@pathway/db";
import { createTenantDto, type CreateTenantDto } from "./dto/create-tenant.dto";
import type { UpdateTenantDto } from "./dto/update-tenant.dto";
import { getPlanDefinition } from "../billing/billing-plans";
import { ADD_ON_SUBSCRIPTION_PLAN_PREFIX } from "../billing/subscription-plan-code";

const PUBLIC_SIGNUP_PATH = "/signup";
const TOKEN_BYTES = 32;

export type PublicSignupLinkResult = {
  tenantId: string;
  signupUrl: string;
  tokenExpiresAt: string | null;
  isStable: boolean;
};

function getWebBaseUrl(): string {
  const explicit = process.env.PUBLIC_WEB_BASE_URL ?? process.env.NEXSTEPS_WEB_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  const isLocal =
    process.env.NODE_ENV === "development" ||
    (process.env.API_HOST ?? "").includes("localhost") ||
    (process.env.NEXT_PUBLIC_API_URL ?? "").includes("localhost");

  return isLocal ? "https://localhost:3000" : "https://nexsteps.dev";
}

function buildSignupUrl(token: string): string {
  const base = getWebBaseUrl().replace(/\/$/, "");
  return `${base}${PUBLIC_SIGNUP_PATH}?token=${encodeURIComponent(token)}`;
}

// Narrow unknown errors that may come from Prisma without using `any`
function isPrismaError(err: unknown): err is { code: string } {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as { code?: unknown }).code === "string"
  );
}

@Injectable()
export class TenantsService {
  async list() {
    return prisma.tenant.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async getBySlug(slug: string) {
    const t = await prisma.tenant.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!t) throw new NotFoundException("tenant not found");
    return t;
  }

  /**
   * Update tenant (site) profile. Caller must ensure user has SITE_ADMIN for this tenant or ORG_ADMIN for tenant's org.
   */
  async updateProfile(
    tenantId: string,
    _userId: string,
    data: UpdateTenantDto,
  ): Promise<{ id: string; name: string; slug: string; timezone: string | null }> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, slug: true, timezone: true, orgId: true },
    });
    if (!tenant) throw new NotFoundException("Tenant not found");

    const updateData: { name?: string; timezone?: string | null } = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.timezone !== undefined) updateData.timezone = data.timezone;

    const updated = await prisma.tenant.update({
      where: { id: tenantId },
      data: updateData,
      select: { id: true, name: true, slug: true, timezone: true },
    });
    return updated;
  }

  async create(input: CreateTenantDto) {
    // Normalize first (be forgiving to clients), then validate
    const normalized = {
      ...input,
      name: String(input.name).trim(),
      slug: String(input.slug).trim().toLowerCase(),
    };
    const parsed = createTenantDto.parse(normalized);

    // Ensure the org exists (Tenant requires an Org)
    const org = await prisma.org.findUnique({
      where: { id: parsed.orgId },
      select: { id: true },
    });
    if (!org) {
      throw new BadRequestException("org not found");
    }

    const maxSitesCap = await this.resolveMaxSitesCap(parsed.orgId);
    if (maxSitesCap !== null) {
      const currentSiteCount = await prisma.tenant.count({
        where: { orgId: parsed.orgId },
      });
      if (currentSiteCount >= maxSitesCap) {
        throw new BadRequestException(
          `sites cap reached (${maxSitesCap}) for current plan`,
        );
      }
    }

    // Pre-check for unique slug to provide a clean error (still race-safe with unique index)
    const exists = await prisma.tenant.findUnique({
      where: { slug: parsed.slug },
    });
    if (exists) {
      throw new BadRequestException("slug already exists");
    }

    // Optional relation connects from DTO (IDs of existing records)
    const usersConnect =
      parsed.users && parsed.users.length > 0
        ? { connect: parsed.users.map((id) => ({ id })) }
        : undefined;
    const groupsConnect =
      parsed.groups && parsed.groups.length > 0
        ? { connect: parsed.groups.map((id) => ({ id })) }
        : undefined;
    const childrenConnect =
      parsed.children && parsed.children.length > 0
        ? { connect: parsed.children.map((id) => ({ id })) }
        : undefined;
    const rolesConnect =
      parsed.roles && parsed.roles.length > 0
        ? { connect: parsed.roles.map((id) => ({ id })) }
        : undefined;

    try {
      return await prisma.tenant.create({
        data: {
          name: parsed.name,
          slug: parsed.slug,
          org: { connect: { id: parsed.orgId } },
          ...(usersConnect ? { users: usersConnect } : {}),
          ...(groupsConnect ? { groups: groupsConnect } : {}),
          ...(childrenConnect ? { children: childrenConnect } : {}),
          ...(rolesConnect ? { roles: rolesConnect } : {}),
        },
        select: {
          id: true,
          name: true,
          slug: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (e: unknown) {
      if (isPrismaError(e)) {
        if (e.code === "P2002") {
          // Unique constraint (e.g., slug)
          throw new BadRequestException("slug already exists");
        }
        if (e.code === "P2003" || e.code === "P2025") {
          // Foreign key constraint / record to connect not found
          throw new BadRequestException("one or more related IDs do not exist");
        }
      }
      throw e;
    }
  }

  /**
   * Get or create a stable public signup link for the given tenant (site).
   * Returns the same signup URL for the site until the link is rotated.
   * Caller must ensure user has SITE_ADMIN for this tenant or ORG_ADMIN for tenant's org.
   */
  async getOrCreatePublicSignupLink(
    tenantId: string,
    orgId: string,
    createdByUserId: string | null,
  ): Promise<PublicSignupLinkResult> {
    const now = new Date();
    const existing = await prisma.publicSignupLink.findFirst({
      where: {
        tenantId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { id: true, tokenForDisplay: true, expiresAt: true },
    });

    if (existing?.tokenForDisplay) {
      return {
        tenantId,
        signupUrl: buildSignupUrl(existing.tokenForDisplay),
        tokenExpiresAt: existing.expiresAt?.toISOString() ?? null,
        isStable: true,
      };
    }

    if (existing) {
      // Link exists but tokenForDisplay was not set (legacy row); rotate to get a new one with tokenForDisplay
      await prisma.publicSignupLink.update({
        where: { id: existing.id },
        data: { revokedAt: now },
      });
    }

    const token = randomBytes(TOKEN_BYTES).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");

    await prisma.publicSignupLink.create({
      data: {
        orgId,
        tenantId,
        tokenHash,
        tokenForDisplay: token,
        expiresAt: null,
        createdByUserId,
      },
    });

    return {
      tenantId,
      signupUrl: buildSignupUrl(token),
      tokenExpiresAt: null,
      isStable: true,
    };
  }

  /**
   * Revoke the current public signup link for the tenant and create a new one.
   * Caller must ensure user has SITE_ADMIN for this tenant or ORG_ADMIN for tenant's org.
   */
  async rotatePublicSignupLink(
    tenantId: string,
    orgId: string,
    createdByUserId: string | null,
  ): Promise<PublicSignupLinkResult> {
    const now = new Date();
    await prisma.publicSignupLink.updateMany({
      where: { tenantId, revokedAt: null },
      data: { revokedAt: now },
    });
    return this.getOrCreatePublicSignupLink(tenantId, orgId, createdByUserId);
  }

  private async resolveMaxSitesCap(orgId: string): Promise<number | null> {
    const [latestSnapshot, latestSubscription] = await Promise.all([
      prisma.orgEntitlementSnapshot.findFirst({
        where: { orgId },
        orderBy: [{ createdAt: "desc" }],
        select: { maxSites: true },
      }),
      prisma.subscription.findFirst({
        where: {
          orgId,
          planCode: {
            not: { startsWith: ADD_ON_SUBSCRIPTION_PLAN_PREFIX },
          },
        },
        orderBy: [{ periodEnd: "desc" }],
        select: { planCode: true },
      }),
    ]);

    if (typeof latestSnapshot?.maxSites === "number") {
      return latestSnapshot.maxSites;
    }

    const planDefinition = getPlanDefinition(latestSubscription?.planCode);
    return planDefinition?.maxSitesIncluded ?? null;
  }
}
