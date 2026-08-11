import "reflect-metadata";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import { REQUIRED_PERMISSION } from "../../access-control/require-permission.decorator";
import { PaceController } from "../pace.controller";
import { PaceExceptionsService } from "../pace-exceptions.service";

jest.mock("@pathway/db", () => ({
  withTenantRlsContext: jest.fn(),
  Prisma: {
    sql: jest.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings: [...strings],
      values,
    })),
    join: jest.fn((values: unknown[]) => values),
  },
}));

const actor = { tenantId: "tenant-1", orgId: "org-1", userId: "user-1" };
const rebuiltAt = new Date("2026-08-11T09:00:00.000Z");

function transaction() {
  return {
    tenant: { findFirst: jest.fn() },
    $queryRaw: jest.fn(),
  };
}

function createService(tx = transaction()) {
  jest
    .mocked(withTenantRlsContext)
    .mockImplementation(async (_tenant, _org, callback) =>
      callback(tx as never),
    );
  return { service: new PaceExceptionsService(), tx };
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    enrollmentId: "enrollment-1",
    enrollmentCreatedAt: new Date("2026-08-11T08:00:00.000Z"),
    childId: "child-1",
    groupId: "group-1",
    groupName: "Explorers",
    subjectId: "subject-1",
    subjectName: "Mathematics",
    progressId: "progress-1",
    currentPace: 1,
    targetPace: 12,
    trackStatus: "ON_TRACK",
    blockCode: null,
    lastAssessmentId: null,
    rebuiltAt,
    terminalAssessmentId: null,
    terminalAssessedOn: null,
    terminalCreatedAt: null,
    ...overrides,
  };
}

describe("PaceExceptionsService", () => {
  beforeEach(() => jest.clearAllMocks());

  it("requires ace.pace.read on the existing PACE controller", () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION,
        PaceController.prototype.exceptions,
      ),
    ).toBe("ace.pace.read");
  });

  it("distinguishes behind, blocked, stale, absent, and warning exceptions", async () => {
    const { service, tx } = createService();
    tx.tenant.findFirst.mockResolvedValue({ id: actor.tenantId });
    tx.$queryRaw.mockResolvedValue([
      row({ enrollmentId: "behind", trackStatus: "BEHIND" }),
      row({ enrollmentId: "blocked", trackStatus: "BLOCKED" }),
      row({
        enrollmentId: "stale",
        lastAssessmentId: "assessment-old",
        terminalAssessmentId: "assessment-correction",
        terminalAssessedOn: new Date("2026-08-11T00:00:00.000Z"),
        terminalCreatedAt: new Date("2026-08-11T10:00:00.000Z"),
      }),
      row({
        enrollmentId: "absent",
        progressId: null,
        currentPace: 2,
        trackStatus: null,
        rebuiltAt: null,
      }),
      row({ enrollmentId: "warning", blockCode: "daily-limit-warning" }),
    ]);

    const result = await service.listExceptions(actor, {});

    expect(
      result.items.map((item) => [item.enrollmentId, item.exceptions]),
    ).toEqual([
      ["behind", ["BEHIND"]],
      ["blocked", ["BLOCKED"]],
      ["stale", ["STALE"]],
      ["absent", ["ABSENT"]],
      ["warning", ["WARNING"]],
    ]);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        child: { id: "child-1" },
        subject: { id: "subject-1", name: "Mathematics" },
      }),
    );
    expect(result.items[0]).not.toHaveProperty("firstName");
    expect(result.items[0].child).not.toHaveProperty("displayName");
  });

  it("uses one bounded tenant query without learner PII or encrypted fields", async () => {
    const { service, tx } = createService();
    tx.tenant.findFirst.mockResolvedValue({ id: actor.tenantId });
    tx.$queryRaw.mockResolvedValue([]);

    await service.listExceptions(actor, { limit: 25 });

    expect(withTenantRlsContext).toHaveBeenCalledWith(
      actor.tenantId,
      actor.orgId,
      expect.any(Function),
    );
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    const sqlText = jest
      .mocked(Prisma.sql)
      .mock.calls.map(([strings]) => strings.join("?"))
      .join(" ");
    const sqlValues = jest
      .mocked(Prisma.sql)
      .mock.calls.flatMap(([, ...values]) => values);
    expect(sqlText).toContain('enrollment."tenantId" = ?');
    expect(sqlText).toContain("enrollment.status = 'ACTIVE'");
    expect(sqlText).toContain("LIMIT ?");
    expect(sqlValues).toEqual(expect.arrayContaining([actor.tenantId, 26]));
    for (const prohibited of [
      "firstName",
      "lastName",
      "preferredName",
      "allergies",
      "additionalNeedsNotes",
      "notes",
      "reason",
      "score",
      "recordedByUserId",
    ]) {
      expect(sqlText).not.toContain(prohibited);
    }
  });

  it("returns a stable cursor and rejects reuse by another tenant before reading", async () => {
    const { service, tx } = createService();
    tx.tenant.findFirst.mockResolvedValue({ id: actor.tenantId });
    tx.$queryRaw.mockResolvedValueOnce([
      row({ enrollmentId: "enrollment-2" }),
      row({
        enrollmentId: "enrollment-1",
        enrollmentCreatedAt: new Date("2026-08-10T08:00:00.000Z"),
      }),
    ]);

    const firstPage = await service.listExceptions(actor, { limit: 1 });
    expect(firstPage.items.map((item) => item.enrollmentId)).toEqual([
      "enrollment-2",
    ]);
    expect(firstPage.nextCursor).toEqual(expect.any(String));

    jest.clearAllMocks();
    await expect(
      service.listExceptions(
        { ...actor, tenantId: "tenant-2" },
        { limit: 1, cursor: firstPage.nextCursor ?? undefined },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(withTenantRlsContext).not.toHaveBeenCalled();
  });

  it("rejects incomplete actors and a missing active site", async () => {
    const { service, tx } = createService();
    await expect(
      service.listExceptions({ ...actor, orgId: "" }, {}),
    ).rejects.toBeInstanceOf(BadRequestException);

    tx.tenant.findFirst.mockResolvedValue(null);
    await expect(service.listExceptions(actor, {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });
});
