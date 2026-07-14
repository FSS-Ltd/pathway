import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  NotImplementedException,
} from "@nestjs/common";
import { prisma, type OrgSector } from "@pathway/db";
import { registerOrgDto } from "./dto/register-org.dto";
import { BillingService } from "../billing/billing.service";
import {
  LoggingService,
  StructuredLogger,
} from "../common/logging/logging.service";
import type { LogContext } from "../common/logging/logging.service";

type RegisterOrgResult = {
  org: {
    id: string;
    name: string;
    slug: string;
    planCode: string;
    isSuite: boolean;
    parentPortalEnabled: boolean;
    sector: OrgSector | null;
  };
  initialTenant?: {
    id: string;
    name: string;
    slug: string;
    orgId: string;
  };
  admin?: {
    assignedUserId?: string;
    invite?: { email: string; fullName: string };
  };
  billing?: {
    started: boolean;
    provider?: string;
    checkoutUrl?: string;
    sessionId?: string;
  };
};

@Injectable()
export class OrgsService {
  private readonly logger: StructuredLogger;
  constructor(
    @Inject(BillingService)
    private readonly billing: BillingService,
    @Inject(LoggingService)
    logging: LoggingService,
  ) {
    // Fallback to Nest Logger if DI fails in dev; avoids crash during bootstrap.
    this.logger = logging
      ? logging.createLogger(OrgsService.name)
      : createLoggerFallback(OrgsService.name);
  }

  /**
   * Register a new Organisation (and optionally its first Tenant).
   * - Validates payload against registerOrgDto
   * - Creates Org (unique slug)
   * - Optionally creates the initial Tenant connected to the Org
   * - Leaves billing/admin bootstrap to follow-up services (hook points noted)
   */
  async register(raw: unknown): Promise<RegisterOrgResult> {
    const dto = await registerOrgDto.parseAsync(raw);

    try {
      const result = await prisma.$transaction(async (tx) => {
        // 1) Create Org
        const org = await tx.org.create({
          data: {
            name: dto.org.name,
            slug: dto.org.slug,
            planCode: dto.org.planCode,
            isSuite: dto.org.isSuite ?? true,
            sector: dto.org.sector as OrgSector,
          },
          select: {
            id: true,
            name: true,
            slug: true,
            planCode: true,
            isSuite: true,
            parentPortalEnabled: true,
            sector: true,
          },
        });

        // 2) Optionally create first Tenant
        let createdTenant:
          | { id: string; name: string; slug: string; orgId: string }
          | undefined;
        if (dto.initialTenant?.create) {
          // Safety: name/slug required already by zod refine
          createdTenant = await tx.tenant.create({
            data: {
              name: dto.initialTenant.name as string,
              slug: dto.initialTenant.slug as string,
              org: { connect: { id: org.id } },
            },
            select: { id: true, name: true, slug: true, orgId: true },
          });
        }

        // 3) Admin bootstrap
        let adminOutcome:
          | {
              assignedUserId?: string;
              invite?: { email: string; fullName: string };
            }
          | undefined;

        if (dto.admin.userId) {
          // Assign existing user as Org ADMIN
          try {
            await tx.userOrgRole.create({
              data: {
                userId: dto.admin.userId,
                orgId: org.id,
                // If enum exists, Prisma will coerce; otherwise string is fine
                role: "ADMIN" as unknown as never,
              },
            });
          } catch (err: unknown) {
            // Ignore duplicate if role already exists
            const code =
              typeof err === "object" && err !== null && "code" in err
                ? String((err as { code?: unknown }).code)
                : undefined;
            if (code !== "P2002") throw err;
          }
          adminOutcome = { assignedUserId: dto.admin.userId };
        } else if (dto.admin.email && dto.admin.fullName) {
          // No userId provided - return invite intent; actual invite flow handled elsewhere
          adminOutcome = {
            invite: { email: dto.admin.email, fullName: dto.admin.fullName },
          };
        }

        // 4) Payment bootstrap (via BillingService checkout)
        let billingOutcome:
          | {
              started: boolean;
              provider?: string;
              checkoutUrl?: string;
              sessionId?: string;
            }
          | undefined;
        if (dto.payment) {
          // derive fallback redirect URLs from env if not provided by caller
          const baseUrl = process.env.APP_PUBLIC_URL ?? "https://example.com";
          const successUrl = `${baseUrl}/billing/success`;
          const cancelUrl = `${baseUrl}/billing/cancel`;

          const checkout = await this.billing.checkout({
            provider: dto.payment.provider ?? "stripe",
            orgId: org.id,
            planCode: org.planCode,
            successUrl,
            cancelUrl,
            mode: "subscription",
            seats: 1,
            customerId: dto.payment.customerId,
            paymentMethodId: dto.payment.paymentMethodId,
            trialDays: dto.payment.trialDays,
            billingEmail: dto.org.billingEmail,
          });

          billingOutcome = {
            started: true,
            provider: checkout.provider,
            checkoutUrl: checkout.checkoutUrl,
            sessionId: checkout.sessionId,
          };
        }

        return {
          org,
          initialTenant: createdTenant,
          admin: adminOutcome,
          billing: billingOutcome,
        };
      });

      return result;
    } catch (e: unknown) {
      this.logger.error("Failed to register org", {
        orgSlug: dto.org?.slug,
        code:
          typeof e === "object" && e !== null && "code" in e
            ? (e as { code?: string }).code ?? "unknown"
            : "unknown",
      });
      this.handlePrismaError(e);
    }
  }

  async getBySlug(slug: string, orgId: string) {
    const org = await prisma.org.findFirst({
      where: { slug, id: orgId },
      select: {
        id: true,
        name: true,
        slug: true,
        planCode: true,
        isSuite: true,
        parentPortalEnabled: true,
        sector: true,
      },
    });
    if (!org) throw new NotFoundException("Org not found");
    return org;
  }

  /**
   * Update current org profile. Used by admin Settings.
   */
  async updateCurrentOrg(
    orgId: string,
    data: { name?: string; parentPortalEnabled?: boolean },
  ): Promise<{
    id: string;
    name: string;
    slug: string;
    parentPortalEnabled: boolean;
  }> {
    const org = await prisma.org.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, slug: true },
    });
    if (!org) throw new NotFoundException("Organisation not found");
    const updateData: { name?: string; parentPortalEnabled?: boolean } = {};
    if (data.name !== undefined) {
      updateData.name = data.name.trim();
    }
    if (data.parentPortalEnabled !== undefined) {
      updateData.parentPortalEnabled = data.parentPortalEnabled;
    }
    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException("At least one field is required");
    }
    const updated = await prisma.org.update({
      where: { id: orgId },
      data: updateData,
      select: { id: true, name: true, slug: true, parentPortalEnabled: true },
    });
    return updated;
  }

  /**
   * Get retention policy for current org (read-only). Returns years; nulls when not configured.
   */
  async getRetentionOverview(orgId: string): Promise<{
    attendanceRetentionYears: number | null;
    safeguardingRetentionYears: number | null;
    notesRetentionYears: number | null;
  }> {
    const policy = await prisma.orgRetentionPolicy.findUnique({
      where: { orgId },
    });
    if (!policy) {
      return {
        attendanceRetentionYears: null,
        safeguardingRetentionYears: null,
        notesRetentionYears: null,
      };
    }
    // Schema has days; map to years for API. Safeguarding/notes not in schema yet.
    const attendanceRetentionYears = Math.floor(
      policy.attendanceRetentionDays / 365,
    );
    return {
      attendanceRetentionYears:
        attendanceRetentionYears >= 0 ? attendanceRetentionYears : null,
      safeguardingRetentionYears: null,
      notesRetentionYears: null,
    };
  }

  async list(orgId: string) {
    return prisma.org.findMany({
      where: { id: orgId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        slug: true,
        planCode: true,
        isSuite: true,
        parentPortalEnabled: true,
        sector: true,
      },
    });
  }

  /**
   * Export organisation data (metadata only: name, slug, site names). No PII.
   * Used by admin Settings "Export organisation data".
   */
  async exportOrganisationData(orgId: string): Promise<{
    orgName: string;
    slug: string;
    sites: { name: string }[];
  }> {
    const org = await prisma.org.findFirst({
      where: { id: orgId },
      select: {
        name: true,
        slug: true,
        tenants: { select: { name: true } },
      },
    });
    if (!org) throw new NotFoundException("Organisation not found");
    return {
      orgName: org.name,
      slug: org.slug,
      sites: org.tenants.map((t) => ({ name: t.name })),
    };
  }

  /**
   * Deactivate organisation. Not implemented yet (no deactivatedAt in schema).
   */
  async deactivateOrganisation(orgId: string): Promise<never> {
    void orgId; // Reserved for future implementation
    throw new NotImplementedException(
      "Deactivation is not implemented yet. Contact support for organisation closure.",
    );
  }

  /**
   * Handoff to billing provider adapter.
   * MVP: no-op; upstream controller or billing module can override/wrap this service later.
   */
  private async bootstrapBilling(): Promise<void> {
    // Intentionally no-op in MVP. Place to call Stripe/GoCardless adapters.
    return;
  }

  private handlePrismaError(e: unknown): never {
    const code =
      typeof e === "object" && e !== null && "code" in e
        ? String((e as { code?: unknown }).code)
        : undefined;
    const message =
      typeof e === "object" &&
      e !== null &&
      "message" in e &&
      typeof (e as { message?: unknown }).message === "string"
        ? (e as { message: string }).message
        : "Unknown error";

    if (code === "P2002") {
      // Unique constraint (likely slug on Org or Tenant)
      throw new ConflictException("Duplicate slug");
    }
    if (code === "P2003") {
      // FK violation (shouldn't happen since we control connects)
      throw new BadRequestException(`Invalid reference: ${message}`);
    }
    if (code === "P2025") {
      throw new NotFoundException("Record not found");
    }
    throw new BadRequestException(`Failed to register org: ${message}`);
  }
}

function createLoggerFallback(component: string): StructuredLogger {
  const nest = new Logger(component);
  return {
    info: (message: string, meta?: LogContext) =>
      nest.log(meta ? { message, ...meta } : message),
    warn: (message: string, meta?: LogContext) =>
      nest.warn(meta ? { message, ...meta } : message),
    error: (message: string, meta?: LogContext, trace?: unknown) =>
      nest.error(meta ? { message, ...meta } : message, trace as any), // eslint-disable-line @typescript-eslint/no-explicit-any
  };
}
