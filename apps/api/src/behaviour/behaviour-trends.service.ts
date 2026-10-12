import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import { EffectivePermissionsService } from "../access-control/effective-permissions.service";
import type { BehaviourActor } from "./behaviour-command.service";
import {
  isIanaTimezone,
  localDateWindowForDate,
} from "./demerit-escalation.support";
import type { BehaviourTrendsQuery } from "./dto/behaviour-entry.dto";
import {
  fillBehaviourTrendBuckets,
  type BehaviourTrendBucket,
} from "./behaviour-trends.support";

type AggregateRow = {
  bucketStart: string;
  totalCount: bigint;
  meritCount: bigint;
  demeritCount: bigint;
  generalCount: bigint;
  meritPoints: bigint;
  demeritPoints: bigint;
  netPoints: bigint;
};

@Injectable()
export class BehaviourTrendsService {
  constructor(
    @Inject(EffectivePermissionsService)
    private readonly permissions: EffectivePermissionsService,
  ) {}

  async get(actor: BehaviourActor, query: BehaviourTrendsQuery) {
    if (
      !actor.tenantId?.trim() ||
      !actor.orgId?.trim() ||
      !actor.userId?.trim()
    ) {
      throw new BadRequestException("A complete active-site actor is required");
    }
    if (query.visibility !== "GENERAL") {
      const sensitiveDecision = await this.permissions.resolve({
        ...actor,
        permission: "ace.behaviour.sensitive.read",
        now: new Date(),
      });
      if (!sensitiveDecision.allowed) {
        throw new ForbiddenException(
          "Sensitive behaviour permission is required",
        );
      }
    }

    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const site = await tx.tenant.findFirst({
        where: { id: actor.tenantId, orgId: actor.orgId },
        select: { timezone: true },
      });
      if (!site) throw new NotFoundException("Active site not found");
      if (!isIanaTimezone(site.timezone)) {
        throw new BadRequestException(
          "The active site has an invalid timezone",
        );
      }
      const start = localDateWindowForDate(query.from, site.timezone, 1).start;
      const end = localDateWindowForDate(query.to, site.timezone, 1).end;
      const bucketUnit =
        query.bucket === "daily"
          ? "day"
          : query.bucket === "weekly"
            ? "week"
            : "month";
      const rows = await tx.$queryRaw<AggregateRow[]>(Prisma.sql`
        SELECT
          to_char(
            date_trunc(
              ${bucketUnit},
              (fact."occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE ${site.timezone}
            ),
            'YYYY-MM-DD'
          ) AS "bucketStart",
          COUNT(*) AS "totalCount",
          COUNT(*) FILTER (WHERE fact."type"::text = 'MERIT') AS "meritCount",
          COUNT(*) FILTER (WHERE fact."type"::text = 'DEMERIT') AS "demeritCount",
          COUNT(*) FILTER (WHERE fact."type"::text = 'GENERAL') AS "generalCount",
          COALESCE(SUM(fact."pointsDelta") FILTER (WHERE fact."type"::text = 'MERIT'), 0) AS "meritPoints",
          COALESCE(SUM(fact."pointsDelta") FILTER (WHERE fact."type"::text = 'DEMERIT'), 0) AS "demeritPoints",
          COALESCE(SUM(fact."pointsDelta"), 0) AS "netPoints"
        FROM "BehaviourEntry" AS fact
        WHERE fact."tenantId" = ${actor.tenantId}
          AND fact."occurredAt" >= ${start}
          AND fact."occurredAt" < ${end}
          AND (${query.visibility} = 'ALL' OR fact."visibility"::text = ${query.visibility})
          AND NOT EXISTS (
            SELECT 1 FROM "BehaviourEntry" AS successor
            WHERE successor."tenantId" = fact."tenantId"
              AND successor."correctsBehaviourEntryId" = fact.id
          )
          AND NOT EXISTS (
            SELECT 1 FROM "BehaviourEntryRetraction" AS retraction
            WHERE retraction."tenantId" = fact."tenantId"
              AND retraction."entryId" = fact.id
          )
        GROUP BY 1
        ORDER BY 1
      `);
      const buckets: BehaviourTrendBucket[] = rows.map((row) => ({
        bucketStart: row.bucketStart,
        totalCount: Number(row.totalCount),
        meritCount: Number(row.meritCount),
        demeritCount: Number(row.demeritCount),
        generalCount: Number(row.generalCount),
        meritPoints: Number(row.meritPoints),
        demeritPoints: Number(row.demeritPoints),
        netPoints: Number(row.netPoints),
      }));
      return {
        from: query.from,
        to: query.to,
        bucket: query.bucket,
        visibility: query.visibility,
        ...fillBehaviourTrendBuckets(query, buckets),
      };
    });
  }
}
