import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { runReadOnlyTransaction } from "@pathway/db";
import { EffectivePermissionsService } from "../access-control/effective-permissions.service";
import { AceNoticePublicationService } from "./ace-notice-publication.service";
import { AceNoticeSchedulingService } from "./ace-notice-scheduling.service";
import type { NoticeActor } from "./ace-notice-access";

interface DueNoticeSchedule {
  id: string;
  tenantId: string;
  orgId: string;
  scheduledByUserId: string;
  scheduledAudienceVersion: string;
  updatedAt: Date;
}

type RunOutcome = "published" | "needsReview" | "skipped";

@Injectable()
export class AceNoticeScheduleRunnerService {
  constructor(
    @Inject(EffectivePermissionsService)
    private readonly permissions: EffectivePermissionsService,
    @Inject(AceNoticePublicationService)
    private readonly publication: AceNoticePublicationService,
    @Inject(AceNoticeSchedulingService)
    private readonly scheduling: AceNoticeSchedulingService,
  ) {}

  async runDue() {
    const candidates = await runReadOnlyTransaction(
      (tx) =>
        tx.$queryRaw<DueNoticeSchedule[]>`
        SELECT "id", "tenantId", "orgId", "scheduledByUserId",
          "scheduledAudienceVersion", "updatedAt"
        FROM app.list_due_notice_schedules()
      `,
    );
    const outcomes = await Promise.allSettled(
      candidates.map((candidate) => this.process(candidate)),
    );
    const retryCount = outcomes.filter(
      (outcome) => outcome.status === "rejected",
    ).length;
    if (retryCount > 0) {
      throw new ServiceUnavailableException(
        `${retryCount} scheduled notice publication attempts need retry`,
      );
    }
    const results = outcomes
      .filter(
        (outcome): outcome is PromiseFulfilledResult<RunOutcome> =>
          outcome.status === "fulfilled",
      )
      .map((outcome) => outcome.value);
    return {
      inspected: candidates.length,
      published: results.filter((result) => result === "published").length,
      needsReview: results.filter((result) => result === "needsReview").length,
    };
  }

  private async process(candidate: DueNoticeSchedule): Promise<RunOutcome> {
    const actor: NoticeActor = {
      tenantId: candidate.tenantId,
      orgId: candidate.orgId,
      userId: candidate.scheduledByUserId,
    };
    const access = await this.permissions.resolve({
      userId: actor.userId,
      orgId: actor.orgId,
      tenantId: actor.tenantId,
      permission: "notices.publish",
      now: new Date(),
    });
    if (!access.allowed) {
      return (await this.scheduling.markFailed(
        candidate.id,
        candidate.updatedAt,
        "PUBLISHER_ACCESS_CHANGED",
        actor,
      ))
        ? "needsReview"
        : "skipped";
    }

    try {
      await this.publication.publishScheduled(
        candidate.id,
        {
          expectedUpdatedAt: candidate.updatedAt.toISOString(),
          expectedAudienceVersion: candidate.scheduledAudienceVersion,
        },
        actor,
      );
      return "published";
    } catch (error) {
      if (
        !(error instanceof BadRequestException) &&
        !(error instanceof ConflictException) &&
        !(error instanceof ForbiddenException) &&
        !(error instanceof NotFoundException)
      )
        throw error;
      const reason =
        error instanceof ForbiddenException
          ? "PUBLISHER_ACCESS_CHANGED"
          : "AUDIENCE_CHANGED";
      return (await this.scheduling.markFailed(
        candidate.id,
        candidate.updatedAt,
        reason,
        actor,
      ))
        ? "needsReview"
        : "skipped";
    }
  }
}
