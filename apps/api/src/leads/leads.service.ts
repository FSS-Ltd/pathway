import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { prisma, Prisma } from "@pathway/db";
import { LeadKind } from "@prisma/client";
import { MailerService } from "../mailer/mailer.service";
import {
  type CreateDemoLeadDto,
  type CreateHomeschoolLeadDto,
  type CreateToolkitLeadDto,
  type CreateTrialLeadDto,
  type CreateReadinessLeadDto,
  type CreateTeamTrackerLeadDto,
} from "./dto/create-lead.dto";
import {
  generateToolkitToken,
  hashToolkitToken,
} from "./toolkit-token.util";

const DEFAULT_TOKEN_TTL_HOURS = 48;
const TEAM_TRACKER_CAMPAIGN = "team-tracker";

function asMetadataRecord(value: Prisma.JsonValue | null): Record<string, Prisma.JsonValue> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, Prisma.JsonValue>;
  }
  return {};
}

function readStringArray(value: Prisma.JsonValue | undefined): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);
  /**
   * Idempotency window: if a lead with the same email+kind was created
   * within this window, we update the existing record instead of creating a new one.
   */
  private readonly IDEMPOTENCY_WINDOW_HOURS = 2;

  constructor(
    @Inject(MailerService) private readonly mailerService: MailerService,
  ) {}

  private async findRecentLead(
    email: string,
    kind: LeadKind,
    sector?: string,
  ): Promise<{ id: string; metadataJson: Prisma.JsonValue | null } | null> {
    const windowStart = new Date();
    windowStart.setHours(windowStart.getHours() - this.IDEMPOTENCY_WINDOW_HOURS);

    const recent = await prisma.lead.findFirst({
      where: {
        email: email.toLowerCase(),
        kind,
        ...(sector ? { sector } : {}),
        createdAt: {
          gte: windowStart,
        },
      },
      select: { id: true, metadataJson: true },
      orderBy: { createdAt: "desc" },
    });

    return recent;
  }

  async createDemoLead(dto: CreateDemoLeadDto) {
    const normalizedEmail = dto.email.toLowerCase().trim();

    const existing = await this.findRecentLead(normalizedEmail, LeadKind.DEMO);

    const lead = existing
      ? await prisma.lead.update({
          where: { id: existing.id },
          data: {
            name: dto.name.trim(),
            organisation: dto.organisation?.trim() || null,
            role: dto.role?.trim() || null,
            sector: dto.sector?.trim() || null,
            message: dto.message?.trim() || null,
            utmSource: dto.utm?.source?.trim() || null,
            utmMedium: dto.utm?.medium?.trim() || null,
            utmCampaign: dto.utm?.campaign?.trim() || null,
            updatedAt: new Date(),
          },
          select: { id: true, kind: true, createdAt: true },
        })
      : await prisma.lead.create({
          data: {
            kind: LeadKind.DEMO,
            email: normalizedEmail,
            name: dto.name.trim(),
            organisation: dto.organisation?.trim() || null,
            role: dto.role?.trim() || null,
            sector: dto.sector?.trim() || null,
            message: dto.message?.trim() || null,
            utmSource: dto.utm?.source?.trim() || null,
            utmMedium: dto.utm?.medium?.trim() || null,
            utmCampaign: dto.utm?.campaign?.trim() || null,
          },
          select: { id: true, kind: true, createdAt: true },
        });

    await this.mailerService.sendDemoRequestEmail({
      name: dto.name.trim(),
      email: normalizedEmail,
      organisation: dto.organisation?.trim() || undefined,
      role: dto.role?.trim() || undefined,
      sector: dto.sector?.trim() || undefined,
      message: dto.message?.trim() || undefined,
    });

    return lead;
  }

  async createToolkitLead(dto: CreateToolkitLeadDto) {
    const normalizedEmail = dto.email.toLowerCase().trim();
    const orgName =
      dto.orgName?.trim() || dto.organisation?.trim() || null;
    const name = dto.name?.trim() || null;

    const ttlHours =
      Number(process.env.TOOLKIT_TOKEN_TTL_HOURS) || DEFAULT_TOKEN_TTL_HOURS;
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + ttlHours);

    const siteUrl =
      process.env.SITE_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "http://localhost:3001";

    const rawToken = generateToolkitToken();
    const tokenHash = hashToolkitToken(rawToken);

    const existing = await this.findRecentLead(normalizedEmail, LeadKind.TOOLKIT);

    let lead: { id: string; kind: LeadKind; createdAt: Date };

    if (existing) {
      lead = await prisma.lead.update({
        where: { id: existing.id },
        data: {
          name,
          organisation: orgName,
          role: dto.role?.trim() || null,
          sector: dto.sector?.trim() || null,
          utmSource: dto.utm?.source?.trim() || null,
          utmMedium: dto.utm?.medium?.trim() || null,
          utmCampaign: dto.utm?.campaign?.trim() || null,
          updatedAt: new Date(),
        },
        select: { id: true, kind: true, createdAt: true },
      });
    } else {
      lead = await prisma.lead.create({
        data: {
          kind: LeadKind.TOOLKIT,
          email: normalizedEmail,
          name,
          organisation: orgName,
          role: dto.role?.trim() || null,
          sector: dto.sector?.trim() || null,
          utmSource: dto.utm?.source?.trim() || null,
          utmMedium: dto.utm?.medium?.trim() || null,
          utmCampaign: dto.utm?.campaign?.trim() || null,
        },
        select: { id: true, kind: true, createdAt: true },
      });
    }

    await prisma.downloadToken.create({
      data: {
        leadId: lead.id,
        tokenHash,
        expiresAt,
      },
    });

    const downloadUrl = `${siteUrl.replace(/\/$/, "")}/api/toolkit.pdf?token=${rawToken}`;

    await this.mailerService.sendToolkitLink({
      to: normalizedEmail,
      name: name || undefined,
      orgName: orgName || undefined,
      downloadUrl,
    });

    return lead;
  }

  async createTeamTrackerLead(dto: CreateTeamTrackerLeadDto): Promise<{
    success: true;
    downloadUrl: string;
  }> {
    const normalizedEmail = dto.email.toLowerCase().trim();
    const existing = await this.findRecentLead(normalizedEmail, LeadKind.TOOLKIT);
    const existingMetadata = asMetadataRecord(existing?.metadataJson ?? null);
    const siteUrl = this.getSiteUrl();
    const rawDownloadToken = generateToolkitToken();
    const hasScheduledSequence =
      existingMetadata.teamTrackerSequenceScheduled === true;
    const rawUnsubscribeToken = dto.consentMarketing && !hasScheduledSequence
      ? generateToolkitToken()
      : undefined;
    const downloadUrl = `${siteUrl}/api/team-tracker/download?token=${rawDownloadToken}`;
    const unsubscribeUrl = rawUnsubscribeToken
      ? `${siteUrl}/team-tracker/unsubscribe?token=${rawUnsubscribeToken}`
      : undefined;
    const highFit = this.isHighFitLead(dto);

    const metadataJson: Prisma.InputJsonObject = {
      ...existingMetadata,
      campaign: TEAM_TRACKER_CAMPAIGN,
      teamTrackerOrganisationType: dto.organisationType,
      teamTrackerRole: dto.role,
      teamTrackerTeamSize: dto.teamSize ?? null,
      teamTrackerCurrentTools: dto.currentTools ?? null,
      teamTrackerHighFit: highFit,
      teamTrackerMarketingConsentAt: dto.consentMarketing
        ? new Date().toISOString()
        : null,
      ...(rawUnsubscribeToken
        ? { teamTrackerUnsubscribeTokenHash: hashToolkitToken(rawUnsubscribeToken) }
        : {}),
    };

    const lead = existing
      ? await prisma.lead.update({
          where: { id: existing.id },
          data: {
            name: dto.name.trim(),
            role: dto.role,
            sector: dto.organisationType,
            utmSource: dto.utm?.source?.trim() || null,
            utmMedium: dto.utm?.medium?.trim() || null,
            utmCampaign: dto.utm?.campaign?.trim() || null,
            metadataJson,
            updatedAt: new Date(),
          },
          select: { id: true },
        })
      : await prisma.lead.create({
          data: {
            kind: LeadKind.TOOLKIT,
            email: normalizedEmail,
            name: dto.name.trim(),
            role: dto.role,
            sector: dto.organisationType,
            utmSource: dto.utm?.source?.trim() || null,
            utmMedium: dto.utm?.medium?.trim() || null,
            utmCampaign: dto.utm?.campaign?.trim() || null,
            metadataJson,
          },
          select: { id: true },
        });

    const expiresAt = new Date();
    expiresAt.setHours(
      expiresAt.getHours() +
        (Number(process.env.TOOLKIT_TOKEN_TTL_HOURS) || DEFAULT_TOKEN_TTL_HOURS),
    );
    await prisma.downloadToken.create({
      data: {
        leadId: lead.id,
        tokenHash: hashToolkitToken(rawDownloadToken),
        expiresAt,
      },
    });

    await this.mailerService.sendTeamTrackerDelivery({
      to: normalizedEmail,
      name: dto.name.trim(),
      downloadUrl,
      previewImageUrl: `${siteUrl}/team-tracker/dashboard.png`,
      unsubscribeUrl,
    });

    if (dto.consentMarketing && unsubscribeUrl) {
      await this.scheduleTeamTrackerFollowUps({
        leadId: lead.id,
        email: normalizedEmail,
        name: dto.name.trim(),
        highFit,
        siteUrl,
        unsubscribeUrl,
        metadataJson,
      });
    }

    return { success: true, downloadUrl };
  }

  async unsubscribeTeamTracker(token: string): Promise<void> {
    const tokenHash = hashToolkitToken(token);
    const lead = await prisma.lead.findFirst({
      where: {
        kind: LeadKind.TOOLKIT,
        metadataJson: {
          path: ["teamTrackerUnsubscribeTokenHash"],
          equals: tokenHash,
        },
      },
      select: { id: true, metadataJson: true },
    });

    if (!lead) {
      throw new UnauthorizedException("Invalid unsubscribe link");
    }

    const metadata = asMetadataRecord(lead.metadataJson);
    const scheduledEmailIds = readStringArray(
      metadata.teamTrackerSequenceEmailIds,
    );
    const results = await Promise.allSettled(
      scheduledEmailIds.map((emailId) => this.mailerService.cancelScheduledEmail(emailId)),
    );
    const failures = results.filter((result) => result.status === "rejected");
    if (failures.length > 0) {
      this.logger.warn(
        `Could not cancel ${failures.length} scheduled team tracker emails for lead ${lead.id}`,
      );
    }

    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        metadataJson: {
          ...metadata,
          teamTrackerMarketingUnsubscribedAt: new Date().toISOString(),
        },
      },
    });
  }

  private async scheduleTeamTrackerFollowUps(params: {
    leadId: string;
    email: string;
    name: string;
    highFit: boolean;
    siteUrl: string;
    unsubscribeUrl: string;
    metadataJson: Prisma.InputJsonObject;
  }): Promise<void> {
    if (params.metadataJson.teamTrackerSequenceScheduled === true) {
      return;
    }

    const followUps = [
      { kind: "day_3" as const, days: 3 },
      { kind: "day_7" as const, days: 7 },
      ...(params.highFit ? [{ kind: "day_12" as const, days: 12 }] : []),
    ];

    try {
      const scheduledEmailIds = (
        await Promise.all(
          followUps.map(({ kind, days }) =>
            this.mailerService.scheduleTeamTrackerFollowUp({
              to: params.email,
              name: params.name,
              previewImageUrl: `${params.siteUrl}/team-tracker/dashboard.png`,
              unsubscribeUrl: params.unsubscribeUrl,
              scheduledAt: this.getIsoDateDaysFromNow(days),
              kind,
              callUrl: `${params.siteUrl}/demo?utm_source=team_tracker&utm_medium=email&utm_campaign=follow_up`,
              trackerUrl: `${params.siteUrl}/team-tracker`,
            }),
          ),
        )
      ).filter((emailId): emailId is string => Boolean(emailId));

      await prisma.lead.update({
        where: { id: params.leadId },
        data: {
          metadataJson: {
            ...params.metadataJson,
            teamTrackerSequenceScheduled: true,
            teamTrackerSequenceEmailIds: scheduledEmailIds,
          },
        },
      });
    } catch (error) {
      this.logger.error(
        `Team tracker follow-up scheduling failed for lead ${params.leadId}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private getSiteUrl(): string {
    return (
      process.env.SITE_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "http://localhost:3001"
    ).replace(/\/$/, "");
  }

  private getIsoDateDaysFromNow(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString();
  }

  private isHighFitLead(dto: CreateTeamTrackerLeadDto): boolean {
    return (
      ["administrator", "leader", "volunteer_coordinator"].includes(dto.role) &&
      (dto.teamSize === "26-50" ||
        dto.teamSize === "51+" ||
        dto.currentTools === "multiple_tools")
    );
  }

  async redeemToolkitToken(token: string): Promise<{
    orgName: string | null;
    name: string | null;
  }> {
    const tokenHash = hashToolkitToken(token);
    const now = new Date();

    const downloadToken = await prisma.downloadToken.findFirst({
      where: {
        tokenHash,
        expiresAt: { gt: now },
      },
      include: { lead: true },
    });

    if (!downloadToken) {
      throw new UnauthorizedException("Invalid or expired token");
    }

    // V1: Allow re-download until expiry. Update downloadedAt only on first use.
    if (!downloadToken.lead.downloadedAt) {
      await prisma.lead.update({
        where: { id: downloadToken.leadId },
        data: { downloadedAt: now },
      });
    }

    return {
      orgName: downloadToken.lead.organisation,
      name: downloadToken.lead.name,
    };
  }

  async createTrialLead(dto: CreateTrialLeadDto) {
    const normalizedEmail = dto.email.toLowerCase().trim();

    const existing = await this.findRecentLead(normalizedEmail, LeadKind.TRIAL);

    if (existing) {
      return prisma.lead.update({
        where: { id: existing.id },
        data: {
          name: dto.name?.trim() || null,
          organisation: dto.organisation?.trim() || null,
          sector: dto.sector?.trim() || null,
          utmSource: dto.utm?.source?.trim() || null,
          utmMedium: dto.utm?.medium?.trim() || null,
          utmCampaign: dto.utm?.campaign?.trim() || null,
          updatedAt: new Date(),
        },
        select: { id: true, kind: true, createdAt: true },
      });
    }

    return prisma.lead.create({
      data: {
        kind: LeadKind.TRIAL,
        email: normalizedEmail,
        name: dto.name?.trim() || null,
        organisation: dto.organisation?.trim() || null,
        sector: dto.sector?.trim() || null,
        utmSource: dto.utm?.source?.trim() || null,
        utmMedium: dto.utm?.medium?.trim() || null,
        utmCampaign: dto.utm?.campaign?.trim() || null,
      },
      select: { id: true, kind: true, createdAt: true },
    });
  }

  async createHomeschoolLead(dto: CreateHomeschoolLeadDto) {
    const normalizedEmail = dto.email.toLowerCase().trim();
    const existing = await this.findRecentLead(
      normalizedEmail,
      LeadKind.TRIAL,
      "homeschool",
    );
    const metadataJson: Prisma.InputJsonObject = {
      campaign: "nexsteps-home-waitlist",
      homeschoolRegion: dto.region,
      homeschoolStage: dto.stage,
      homeschoolMarketingConsentAt: new Date().toISOString(),
    };
    const data = {
      name: dto.firstName.trim(),
      sector: "homeschool",
      utmSource: dto.utm?.source?.trim() || null,
      utmMedium: dto.utm?.medium?.trim() || null,
      utmCampaign: dto.utm?.campaign?.trim() || null,
      metadataJson,
    };

    if (existing) {
      return prisma.lead.update({
        where: { id: existing.id },
        data: { ...data, updatedAt: new Date() },
        select: { id: true, kind: true, createdAt: true },
      });
    }

    return prisma.lead.create({
      data: {
        ...data,
        kind: LeadKind.TRIAL,
        email: normalizedEmail,
      },
      select: { id: true, kind: true, createdAt: true },
    });
  }

  async createReadinessLead(dto: CreateReadinessLeadDto) {
    const normalizedEmail = dto.email.toLowerCase().trim();

    const existing = await this.findRecentLead(normalizedEmail, LeadKind.READINESS);

    const metadataJson = {
      answers: dto.answers,
      score: dto.score,
      band: dto.band,
      riskAreas: dto.riskAreas,
    };

    if (existing) {
      return prisma.lead.update({
        where: { id: existing.id },
        data: {
          name: dto.name.trim(),
          organisation: dto.organisation?.trim() || null,
          sector: dto.sector?.trim() || null,
          utmSource: dto.utm?.source?.trim() || null,
          utmMedium: dto.utm?.medium?.trim() || null,
          utmCampaign: dto.utm?.campaign?.trim() || null,
          metadataJson,
          updatedAt: new Date(),
        },
        select: { id: true, kind: true, createdAt: true },
      });
    }

    return prisma.lead.create({
      data: {
        kind: LeadKind.READINESS,
        email: normalizedEmail,
        name: dto.name.trim(),
        organisation: dto.organisation?.trim() || null,
        sector: dto.sector?.trim() || null,
        utmSource: dto.utm?.source?.trim() || null,
        utmMedium: dto.utm?.medium?.trim() || null,
        utmCampaign: dto.utm?.campaign?.trim() || null,
        metadataJson,
      },
      select: { id: true, kind: true, createdAt: true },
    });
  }
}
