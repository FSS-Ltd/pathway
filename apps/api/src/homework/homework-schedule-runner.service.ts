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
import { HomeworkService, type HomeworkActor } from "./homework.service";

interface DueHomeworkSchedule {
  id: string;
  tenantId: string;
  orgId: string;
  scheduledByUserId: string;
  version: number;
}

type RunOutcome = "published" | "needsReview" | "skipped";

@Injectable()
export class HomeworkScheduleRunnerService {
  constructor(
    @Inject(EffectivePermissionsService)
    private readonly permissions: EffectivePermissionsService,
    @Inject(HomeworkService) private readonly homework: HomeworkService,
  ) {}

  async runDue() {
    if (process.env.ACE_HOMEWORK_PUBLICATION_ENABLED !== "true") {
      return { inspected: 0, published: 0, needsReview: 0 };
    }
    const candidates = await runReadOnlyTransaction(
      (tx) =>
        tx.$queryRaw<DueHomeworkSchedule[]>`
        SELECT "id", "tenantId", "orgId", "scheduledByUserId", "version"
        FROM app.list_due_homework_schedules()
      `,
    );
    const outcomes = await Promise.allSettled(
      candidates.map((candidate) => this.process(candidate)),
    );
    const retries = outcomes.filter((outcome) => outcome.status === "rejected");
    if (retries.length > 0) {
      throw new ServiceUnavailableException(
        `${retries.length} scheduled homework publications need retry`,
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

  private async process(candidate: DueHomeworkSchedule): Promise<RunOutcome> {
    const actor: HomeworkActor = {
      tenantId: candidate.tenantId,
      orgId: candidate.orgId,
      userId: candidate.scheduledByUserId,
    };
    const access = await this.permissions.resolve({
      userId: actor.userId,
      orgId: actor.orgId,
      tenantId: actor.tenantId,
      permission: "ace.homework.assignments.manage",
      now: new Date(),
    });
    if (!access.allowed) {
      return (await this.homework.markScheduleNeedsReview(
        candidate.id,
        candidate.version,
        "PUBLISHER_ACCESS_CHANGED",
        actor,
      ))
        ? "needsReview"
        : "skipped";
    }
    try {
      await this.homework.publishScheduled(
        candidate.id,
        { version: candidate.version },
        actor,
      );
      return "published";
    } catch (error) {
      if (
        !(error instanceof BadRequestException) &&
        !(error instanceof ConflictException) &&
        !(error instanceof ForbiddenException) &&
        !(error instanceof NotFoundException)
      ) {
        throw error;
      }
      return (await this.homework.markScheduleNeedsReview(
        candidate.id,
        candidate.version,
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
