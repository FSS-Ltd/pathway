import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { prisma } from "@pathway/db";
import {
  generateAutomationToken,
  hashAutomationToken,
} from "./automation-token.util";

type AutomationTokenRecord = {
  id: string;
  name: string;
  tokenHash: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
};

type RateLimitWindow = {
  windowStartMs: number;
  count: number;
};

type AutomationPrismaClient = {
  automationApiToken: {
    create: (args: {
      data: { name: string; tokenHash: string; expiresAt: Date | null };
      select: { id: true; name: true; expiresAt: true };
    }) => Promise<{ id: string; name: string; expiresAt: Date | null }>;
    findFirst: (args: {
      where: {
        tokenHash: string;
        revokedAt: null;
        OR: [{ expiresAt: null }, { expiresAt: { gt: Date } }];
      };
      select: { id: true; name: true };
    }) => Promise<{ id: string; name: string } | null>;
    update: (args: {
      where: { id: string };
      data: { lastUsedAt?: Date; revokedAt?: Date };
      select?: { id: true; revokedAt: true };
    }) => Promise<{ id: string; revokedAt?: Date }>;
  };
  automationBlogPublishAudit: {
    create: (args: {
      data: {
        tokenId: string;
        tokenName: string;
        blogPostId: string;
        blogSlug: string;
        publishedAt: Date;
      };
    }) => Promise<unknown>;
  };
};

@Injectable()
export class BlogAutomationTokenService {
  private readonly requestsPerMinute: number;
  private readonly rateLimitByTokenId = new Map<string, RateLimitWindow>();
  private readonly automationPrisma = prisma as unknown as AutomationPrismaClient;

  constructor() {
    const rawLimit = Number(process.env.BLOG_AUTOMATION_RATE_LIMIT_PER_MINUTE);
    this.requestsPerMinute =
      Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : 30;
  }

  async createToken(input: {
    name: string;
    expiresAt?: Date | null;
  }): Promise<{ id: string; name: string; token: string; expiresAt: Date | null }> {
    const token = generateAutomationToken();
    const tokenHash = hashAutomationToken(token);

    const created = await this.automationPrisma.automationApiToken.create({
      data: {
        name: input.name,
        tokenHash,
        expiresAt: input.expiresAt ?? null,
      },
      select: {
        id: true,
        name: true,
        expiresAt: true,
      },
    });

    return {
      id: created.id,
      name: created.name,
      token,
      expiresAt: created.expiresAt,
    };
  }

  async authenticate(rawToken: string): Promise<{ id: string; name: string }> {
    const tokenHash = hashAutomationToken(rawToken);
    const now = new Date();

    const token = (await this.automationPrisma.automationApiToken.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: {
        id: true,
        name: true,
      },
    })) as Pick<AutomationTokenRecord, "id" | "name"> | null;

    if (!token) {
      throw new UnauthorizedException("Invalid or expired automation token");
    }

    await this.automationPrisma.automationApiToken.update({
      where: { id: token.id },
      data: { lastUsedAt: now },
    });

    return token;
  }

  assertWithinRateLimit(tokenId: string): void {
    const nowMs = Date.now();
    const windowMs = 60_000;
    const current = this.rateLimitByTokenId.get(tokenId);

    if (!current || nowMs - current.windowStartMs >= windowMs) {
      this.rateLimitByTokenId.set(tokenId, {
        windowStartMs: nowMs,
        count: 1,
      });
      return;
    }

    if (current.count >= this.requestsPerMinute) {
      throw new HttpException(
        `Rate limit exceeded for automation token (max ${this.requestsPerMinute}/minute)`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    current.count += 1;
    this.rateLimitByTokenId.set(tokenId, current);
  }

  async recordPublishAudit(input: {
    tokenId: string;
    tokenName: string;
    blogPostId: string;
    blogSlug: string;
    publishedAt: Date;
  }): Promise<void> {
    await this.automationPrisma.automationBlogPublishAudit.create({
      data: {
        tokenId: input.tokenId,
        tokenName: input.tokenName,
        blogPostId: input.blogPostId,
        blogSlug: input.blogSlug,
        publishedAt: input.publishedAt,
      },
    });
  }

  async revokeToken(id: string): Promise<{ id: string; revokedAt: Date }> {
    const now = new Date();
    try {
      const revoked = await this.automationPrisma.automationApiToken.update({
        where: { id },
        data: { revokedAt: now },
        select: { id: true, revokedAt: true },
      });
      return {
        id: revoked.id,
        revokedAt: revoked.revokedAt ?? now,
      };
    } catch {
      throw new NotFoundException("Automation token not found");
    }
  }
}
