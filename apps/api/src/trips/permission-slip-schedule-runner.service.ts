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
import { PermissionSlipVersionService } from "./permission-slip-version.service";
import type { TripSlipActor } from "./trip-slip-access";

interface DueSlipSchedule {
  versionId: string;
  permissionSlipId: string;
  tenantId: string;
  orgId: string;
  scheduledByUserId: string;
}

type Outcome = "published" | "needsReview" | "skipped";

@Injectable()
export class PermissionSlipScheduleRunnerService {
  constructor(
    @Inject(EffectivePermissionsService)
    private readonly permissions: EffectivePermissionsService,
    @Inject(PermissionSlipVersionService)
    private readonly slips: PermissionSlipVersionService,
  ) {}

  async runDue() {
    if (process.env.ACE_TRIP_SLIP_PUBLICATION_ENABLED !== "true")
      return { inspected: 0, published: 0, needsReview: 0 };
    const candidates = await runReadOnlyTransaction(
      (tx) => tx.$queryRaw<DueSlipSchedule[]>`
        SELECT "versionId", "permissionSlipId", "tenantId", "orgId", "scheduledByUserId"
        FROM app.list_due_permission_slip_schedules()
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
        `${failures.length} scheduled permission slips need retry`,
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

  private async process(candidate: DueSlipSchedule): Promise<Outcome> {
    const actor: TripSlipActor = {
      tenantId: candidate.tenantId,
      orgId: candidate.orgId,
      userId: candidate.scheduledByUserId,
    };
    const decision = await this.permissions.resolve({
      userId: actor.userId,
      tenantId: actor.tenantId,
      orgId: actor.orgId,
      permission: "school.permission_slips.manage",
      now: new Date(),
    });
    if (!decision.allowed) {
      return (await this.slips.markScheduleNeedsReview(
        candidate.permissionSlipId,
        candidate.versionId,
        "PUBLISHER_ACCESS_CHANGED",
        actor,
      ))
        ? "needsReview"
        : "skipped";
    }
    try {
      await this.slips.publish(
        candidate.permissionSlipId,
        candidate.versionId,
        actor,
        true,
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
      return (await this.slips.markScheduleNeedsReview(
        candidate.permissionSlipId,
        candidate.versionId,
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
