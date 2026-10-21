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
import { FaithService } from "./faith.service";
import { publicationEnabled } from "./faith-content";
import type { FaithActor } from "./faith-access";

interface DueFaithSchedule {
  draftId: string;
  faithContentId: string;
  tenantId: string;
  orgId: string;
  scheduledByUserId: string;
  scheduleExpectedVersionId: string | null;
}

type Outcome = "published" | "needsReview" | "skipped";

@Injectable()
export class FaithScheduleRunnerService {
  constructor(
    @Inject(EffectivePermissionsService)
    private readonly permissions: EffectivePermissionsService,
    @Inject(FaithService) private readonly faith: FaithService,
  ) {}

  async runDue() {
    if (!publicationEnabled())
      return { inspected: 0, published: 0, needsReview: 0 };
    const candidates = await runReadOnlyTransaction(
      (tx) => tx.$queryRaw<DueFaithSchedule[]>`
      SELECT "draftId", "faithContentId", "tenantId", "orgId", "scheduledByUserId", "scheduleExpectedVersionId"
      FROM app.list_due_faith_schedules()
    `,
    );
    const outcomes = await Promise.allSettled(
      candidates.map((candidate) => this.process(candidate)),
    );
    const failures = outcomes.filter(
      (outcome) => outcome.status === "rejected",
    );
    if (failures.length > 0)
      throw new ServiceUnavailableException(
        `${failures.length} scheduled Faith publications need retry`,
      );
    const results = outcomes
      .filter(
        (outcome): outcome is PromiseFulfilledResult<Outcome> =>
          outcome.status === "fulfilled",
      )
      .map((outcome) => outcome.value);
    return {
      inspected: candidates.length,
      published: results.filter((value) => value === "published").length,
      needsReview: results.filter((value) => value === "needsReview").length,
    };
  }

  private async process(candidate: DueFaithSchedule): Promise<Outcome> {
    const actor: FaithActor = {
      tenantId: candidate.tenantId,
      orgId: candidate.orgId,
      userId: candidate.scheduledByUserId,
    };
    const decision = await this.permissions.resolve({
      userId: actor.userId,
      tenantId: actor.tenantId,
      orgId: actor.orgId,
      permission: "ace.faith.publish",
      now: new Date(),
    });
    if (!decision.allowed) {
      return (await this.faith.markScheduleNeedsReview(
        candidate.draftId,
        candidate.scheduleExpectedVersionId,
        "PUBLISHER_ACCESS_CHANGED",
        actor,
      ))
        ? "needsReview"
        : "skipped";
    }
    try {
      await this.faith.publishScheduled(
        candidate.faithContentId,
        {
          draftId: candidate.draftId,
          expectedVersionId: candidate.scheduleExpectedVersionId,
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
      return (await this.faith.markScheduleNeedsReview(
        candidate.draftId,
        candidate.scheduleExpectedVersionId,
        error instanceof ForbiddenException
          ? "PUBLISHER_ACCESS_CHANGED"
          : "PUBLICATION_INPUT_CHANGED",
        actor,
      ))
        ? "needsReview"
        : "skipped";
    }
  }
}
