import {
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { prisma } from "@pathway/db";
import { LeadKind } from "@prisma/client";
import { MailerService } from "../mailer/mailer.service";
import {
  type CreateDemoLeadDto,
  type CreateToolkitLeadDto,
  type CreateTrialLeadDto,
  type CreateReadinessLeadDto,
} from "./dto/create-lead.dto";
import {
  generateToolkitToken,
  hashToolkitToken,
} from "./toolkit-token.util";

const DEFAULT_TOKEN_TTL_HOURS = 48;

@Injectable()
export class LeadsService {
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
  ): Promise<{ id: string } | null> {
    const windowStart = new Date();
    windowStart.setHours(windowStart.getHours() - this.IDEMPOTENCY_WINDOW_HOURS);

    const recent = await prisma.lead.findFirst({
      where: {
        email: email.toLowerCase(),
        kind,
        createdAt: {
          gte: windowStart,
        },
      },
      select: { id: true },
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

