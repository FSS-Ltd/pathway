import "reflect-metadata";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import { REQUIRED_PERMISSION } from "../../access-control/require-permission.decorator";
import { PaceController } from "../pace.controller";
import { PaceQueryService } from "../pace-query.service";
import { StudentSubjectsController } from "../student-subjects.controller";

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

function transaction() {
  return {
    tenant: { findFirst: jest.fn() },
    child: { findFirst: jest.fn() },
    paceProgress: { findMany: jest.fn() },
    $queryRaw: jest.fn(),
  };
}

function createService(tx = transaction()) {
  jest
    .mocked(withTenantRlsContext)
    .mockImplementation(async (_tenant, _org, callback) => callback(tx as never));
  return { service: new PaceQueryService(), tx };
}

describe("PaceQueryService", () => {
  beforeEach(() => jest.clearAllMocks());

  it("requires ace.pace.read on both PACE read routes", () => {
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSION, PaceController.prototype.roster),
    ).toBe("ace.pace.read");
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION,
        StudentSubjectsController.prototype.listPace,
      ),
    ).toBe("ace.pace.read");
  });

  it("returns only active enrolments and exposes the current ACE level metadata", async () => {
    const { service, tx } = createService();
    tx.tenant.findFirst.mockResolvedValue({ id: "tenant-1" });
    tx.$queryRaw.mockResolvedValue([
      {
        enrollmentId: "enrolment-1",
        enrollmentCreatedAt: new Date("2026-09-02T09:00:00.000Z"),
        childId: "child-1",
        firstName: "Ada",
        lastName: "Lovelace",
        preferredName: null,
        groupId: "group-1",
        groupName: "Explorers",
        subjectId: "subject-1",
        subjectName: "Mathematics",
        currentPace: 1,
        targetPace: 12,
        trackStatus: "ON_TRACK",
        rebuiltAt: new Date("2026-09-02T09:00:00.000Z"),
      },
    ]);

    await expect(service.listRoster(actor, {})).resolves.toEqual({
      items: [
        {
          child: { id: "child-1", displayName: "Ada Lovelace" },
          group: { id: "group-1", name: "Explorers" },
          subject: { id: "subject-1", name: "Mathematics" },
          currentPace: 1,
          targetPace: 12,
          status: "ON_TRACK",
          currentLevel: {
            level: 1,
            ukYearTooltip:
              "UK Year 2 equivalent. This is not a placement recommendation.",
          },
          rebuiltAt: "2026-09-02T09:00:00.000Z",
        },
      ],
      nextCursor: null,
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(withTenantRlsContext).toHaveBeenCalledWith(
      "tenant-1",
      "org-1",
      expect.any(Function),
    );
  });

  it("keeps roster filters and cursors in the single bounded roster query", async () => {
    const { service, tx } = createService();
    tx.tenant.findFirst.mockResolvedValue({ id: "tenant-1" });
    tx.$queryRaw.mockResolvedValue([
      ...Array.from({ length: 50 }, (_, index) => ({
        enrollmentId: `enrolment-${index}`,
        enrollmentCreatedAt: new Date("2026-09-02T09:00:00.000Z"),
        childId: `child-${index}`,
        firstName: `Child ${index}`,
        lastName: "Example",
        preferredName: null,
        groupId: "group-1",
        groupName: "Explorers",
        subjectId: "subject-1",
        subjectName: "Mathematics",
        currentPace: 1,
        targetPace: 12,
        trackStatus: "AT_RISK",
        rebuiltAt: new Date("2026-09-02T09:00:00.000Z"),
      })),
      {
        enrollmentId: "enrolment-next",
        enrollmentCreatedAt: new Date("2026-09-01T09:00:00.000Z"),
        childId: "child-next",
        firstName: "Next",
        lastName: "Example",
        preferredName: null,
        groupId: "group-1",
        groupName: "Explorers",
        subjectId: "subject-1",
        subjectName: "Mathematics",
        currentPace: 1,
        targetPace: 12,
        trackStatus: "AT_RISK",
        rebuiltAt: new Date("2026-09-01T09:00:00.000Z"),
      },
    ]);

    const result = await service.listRoster(actor, {
      subjectId: "subject-1",
      status: "AT_RISK",
      groupId: "group-1",
      search: "Ada",
      limit: 50,
    });

    expect(result.items).toHaveLength(50);
    expect(result.nextCursor).toEqual(expect.any(String));
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw.mock.calls[0]).toHaveLength(1);
    const sqlText = jest
      .mocked(Prisma.sql)
      .mock.calls.map(([strings]) => strings.join("?"))
      .join(" ");
    const sqlValues = jest
      .mocked(Prisma.sql)
      .mock.calls.flatMap(([, ...values]) => values);
    expect(sqlText).toContain('enrollment.status = \'ACTIVE\'');
    expect(sqlText).toContain('progress."trackStatus" = ?');
    expect(sqlText).toContain('::"PaceTrackStatus"');
    expect(sqlText).toContain('child."firstName" ILIKE ?');
    expect(sqlText).not.toContain("allergies");
    expect(sqlValues).toEqual(
      expect.arrayContaining(["tenant-1", "subject-1", "AT_RISK", "group-1", "%Ada%"]),
    );
  });

  it("rejects a child outside the active site before querying progress", async () => {
    const { service, tx } = createService();
    tx.tenant.findFirst.mockResolvedValue({ id: "tenant-1" });
    tx.child.findFirst.mockResolvedValue(null);

    await expect(service.getChildProgress("other-child", actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tx.paceProgress.findMany).not.toHaveBeenCalled();
  });

  it("reads child progress with allow-listed fields and no per-subject query", async () => {
    const { service, tx } = createService();
    tx.tenant.findFirst.mockResolvedValue({ id: "tenant-1" });
    tx.child.findFirst.mockResolvedValue({
      id: "child-1",
      firstName: "Ada",
      lastName: "Lovelace",
      preferredName: "Ada",
      group: { id: "group-1", name: "Explorers" },
      subjectEnrollments: [
        { subject: { id: "subject-1", name: "Mathematics" }, currentPace: 1, targetPace: 12 },
        { subject: { id: "subject-2", name: "English" }, currentPace: 13, targetPace: 24 },
      ],
    });
    tx.paceProgress.findMany.mockResolvedValue([
      {
        subjectId: "subject-1",
        currentPace: 1,
        targetPace: 12,
        trackStatus: "ON_TRACK",
        rebuiltAt: new Date("2026-09-02T09:00:00.000Z"),
      },
      {
        subjectId: "subject-2",
        currentPace: 13,
        targetPace: 24,
        trackStatus: "AHEAD",
        rebuiltAt: new Date("2026-09-02T10:00:00.000Z"),
      },
    ]);

    const result = await service.getChildProgress("child-1", actor);

    expect(result.subjects).toHaveLength(2);
    expect(result.subjects[1]).toMatchObject({
      currentLevel: { level: 2 },
      status: "AHEAD",
    });
    expect(tx.paceProgress.findMany).toHaveBeenCalledTimes(1);
    expect(tx.child.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.not.objectContaining({ allergies: true, notes: true }),
      }),
    );
    const childSelect = tx.child.findFirst.mock.calls[0][0].select;
    expect(childSelect).not.toHaveProperty("additionalNeedsNotes");
    expect(childSelect).not.toHaveProperty("schoolName");
  });

  it("rejects malformed cursors and incomplete active-site actors", async () => {
    const { service } = createService();
    await expect(service.listRoster(actor, { cursor: "invalid" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.listRoster({ ...actor, orgId: "" }, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("keeps a valid cursor bound to the same tenant-filtered roster ordering", async () => {
    const { service, tx } = createService();
    tx.tenant.findFirst.mockResolvedValue({ id: "tenant-1" });
    tx.$queryRaw.mockResolvedValue([]);
    const cursor = Buffer.from(
      JSON.stringify({ createdAt: "2026-09-02T09:00:00.000Z", id: "enrolment-1" }),
    ).toString("base64url");

    await service.listRoster(actor, { cursor });

    const sqlText = jest
      .mocked(Prisma.sql)
      .mock.calls.map(([strings]) => strings.join("?"))
      .join(" ");
    const sqlValues = jest
      .mocked(Prisma.sql)
      .mock.calls.flatMap(([, ...values]) => values);
    expect(sqlText).toContain('enrollment."createdAt" < ?');
    expect(sqlText).toContain('enrollment.id < ?');
    expect(sqlValues).toEqual(
      expect.arrayContaining([new Date("2026-09-02T09:00:00.000Z"), "enrolment-1"]),
    );
  });
});
