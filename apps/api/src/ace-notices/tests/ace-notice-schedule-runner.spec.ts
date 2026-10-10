import {
  ConflictException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { runReadOnlyTransaction } from "@pathway/db";
import { EffectivePermissionsService } from "../../access-control/effective-permissions.service";
import { AceNoticePublicationService } from "../ace-notice-publication.service";
import { AceNoticeScheduleRunnerController } from "../ace-notice-schedule-runner.controller";
import { AceNoticeScheduleRunnerService } from "../ace-notice-schedule-runner.service";
import { AceNoticeSchedulingService } from "../ace-notice-scheduling.service";

jest.mock("@pathway/db", () => ({ runReadOnlyTransaction: jest.fn() }));

const candidate = {
  id: "notice-a",
  tenantId: "site-a",
  orgId: "org-a",
  scheduledByUserId: "publisher-a",
  scheduledAudienceVersion: "a".repeat(64),
  updatedAt: new Date("2026-10-10T10:00:00.000Z"),
};

function createRunner() {
  const permissions = {
    resolve: jest.fn().mockResolvedValue({ allowed: true }),
  };
  const publication = {
    publishScheduled: jest.fn().mockResolvedValue({ publishedAt: new Date() }),
  };
  const scheduling = { markFailed: jest.fn().mockResolvedValue(true) };
  jest.mocked(runReadOnlyTransaction).mockResolvedValue([candidate]);
  const runner = new AceNoticeScheduleRunnerService(
    permissions as unknown as EffectivePermissionsService,
    publication as unknown as AceNoticePublicationService,
    scheduling as unknown as AceNoticeSchedulingService,
  );
  return { runner, permissions, publication, scheduling };
}

describe("scheduled notice runner", () => {
  beforeEach(() => jest.clearAllMocks());

  it("publishes a due schedule with its reviewed revision and audience", async () => {
    const { runner, permissions, publication } = createRunner();
    await expect(runner.runDue()).resolves.toEqual({
      inspected: 1,
      published: 1,
      needsReview: 0,
    });
    expect(permissions.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: candidate.tenantId,
        userId: candidate.scheduledByUserId,
        permission: "notices.publish",
      }),
    );
    expect(publication.publishScheduled).toHaveBeenCalledWith(
      candidate.id,
      {
        expectedUpdatedAt: candidate.updatedAt.toISOString(),
        expectedAudienceVersion: candidate.scheduledAudienceVersion,
      },
      {
        tenantId: candidate.tenantId,
        orgId: candidate.orgId,
        userId: candidate.scheduledByUserId,
      },
    );
  });

  it("pauses publication when the publisher has lost access", async () => {
    const { runner, permissions, publication, scheduling } = createRunner();
    permissions.resolve.mockResolvedValue({ allowed: false });
    await expect(runner.runDue()).resolves.toEqual({
      inspected: 1,
      published: 0,
      needsReview: 1,
    });
    expect(publication.publishScheduled).not.toHaveBeenCalled();
    expect(scheduling.markFailed).toHaveBeenCalledWith(
      candidate.id,
      candidate.updatedAt,
      "PUBLISHER_ACCESS_CHANGED",
      expect.objectContaining({ tenantId: candidate.tenantId }),
    );
  });

  it("pauses a changed audience but retries an unexpected database failure", async () => {
    const { runner, publication, scheduling } = createRunner();
    publication.publishScheduled.mockRejectedValueOnce(
      new ConflictException("Audience changed"),
    );
    await expect(runner.runDue()).resolves.toEqual({
      inspected: 1,
      published: 0,
      needsReview: 1,
    });
    expect(scheduling.markFailed).toHaveBeenCalledWith(
      candidate.id,
      candidate.updatedAt,
      "AUDIENCE_CHANGED",
      expect.any(Object),
    );

    publication.publishScheduled.mockRejectedValueOnce(
      new Error("database connection lost"),
    );
    await expect(runner.runDue()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(scheduling.markFailed).toHaveBeenCalledTimes(1);
  });
});

describe("scheduled notice cron route", () => {
  const priorSecret = process.env.CRON_SECRET;

  afterAll(() => {
    if (priorSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = priorSecret;
  });

  it("rejects missing or wrong authorization and accepts the configured bearer", async () => {
    const runner = { runDue: jest.fn().mockResolvedValue({ inspected: 0 }) };
    const controller = new AceNoticeScheduleRunnerController(
      runner as unknown as AceNoticeScheduleRunnerService,
    );
    process.env.CRON_SECRET = "test-secret-at-least-sixteen-characters";
    expect(() => controller.run(undefined)).toThrow(UnauthorizedException);
    expect(() => controller.run("Bearer wrong-secret")).toThrow(
      UnauthorizedException,
    );
    expect(runner.runDue).not.toHaveBeenCalled();
    await expect(
      controller.run(`Bearer ${process.env.CRON_SECRET}`),
    ).resolves.toEqual({ inspected: 0 });
  });
});
