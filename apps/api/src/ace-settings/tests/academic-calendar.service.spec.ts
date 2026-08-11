import { BadRequestException, ConflictException } from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { AcademicCalendarService } from "../academic-calendar.service";

jest.mock("@pathway/db", () => ({
  withTenantRlsContext: jest.fn(),
}));

const TENANT_ID = "tenant-1";
const ORG_ID = "org-1";
const ACTOR_ID = "user-1";

function actor() {
  return { tenantId: TENANT_ID, orgId: ORG_ID, userId: ACTOR_ID };
}

function command() {
  return {
    reason: "Set the first academic calendar",
    name: "2026/27",
    startsOn: "2026-09-01",
    endsOn: "2027-07-31",
    periods: [
      { name: "Autumn", startsOn: "2026-09-01", endsOn: "2026-12-18" },
      { name: "Spring", startsOn: "2027-01-04", endsOn: "2027-03-26" },
    ],
  };
}

function createdYear() {
  return {
    id: "year-1",
    name: "2026/27",
    startsOn: new Date("2026-09-01T12:00:00.000Z"),
    endsOn: new Date("2027-07-31T12:00:00.000Z"),
    status: "ACTIVE",
    periods: [
      {
        id: "period-1",
        name: "Autumn",
        startsOn: new Date("2026-09-01T12:00:00.000Z"),
        endsOn: new Date("2026-12-18T12:00:00.000Z"),
        status: "ACTIVE",
      },
    ],
  };
}

function createTransaction() {
  return {
    tenant: { findFirst: jest.fn() },
    academicYear: { findMany: jest.fn(), create: jest.fn() },
    auditEvent: { create: jest.fn() },
    outboxEvent: { createMany: jest.fn(), findFirstOrThrow: jest.fn() },
  };
}

function createService(tx = createTransaction()) {
  jest
    .mocked(withTenantRlsContext)
    .mockImplementation(async (_tenantId, _orgId, callback) =>
      callback(tx as never),
    );
  return { service: new AcademicCalendarService(), tx };
}

describe("AcademicCalendarService", () => {
  beforeEach(() => jest.clearAllMocks());

  it("creates an active year and its initial non-overlapping periods in the tenant RLS transaction", async () => {
    const { service, tx } = createService();
    tx.tenant.findFirst.mockResolvedValue({ timezone: "Europe/London" });
    tx.academicYear.create.mockResolvedValue(createdYear());
    tx.auditEvent.create.mockResolvedValue({});
    tx.outboxEvent.createMany.mockResolvedValue({ count: 1 });
    tx.outboxEvent.findFirstOrThrow.mockResolvedValue({ id: "outbox-1" });

    await expect(service.create(command(), actor())).resolves.toEqual({
      id: "year-1",
      name: "2026/27",
      startsOn: "2026-09-01",
      endsOn: "2027-07-31",
      status: "ACTIVE",
      periods: [
        {
          id: "period-1",
          name: "Autumn",
          startsOn: "2026-09-01",
          endsOn: "2026-12-18",
          status: "ACTIVE",
        },
      ],
    });

    expect(withTenantRlsContext).toHaveBeenCalledWith(
      TENANT_ID,
      ORG_ID,
      expect.any(Function),
    );
    expect(tx.academicYear.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          name: "2026/27",
          status: "ACTIVE",
          startsOn: new Date("2026-09-01T12:00:00.000Z"),
          endsOn: new Date("2027-07-31T12:00:00.000Z"),
          periods: {
            create: expect.arrayContaining([
              expect.objectContaining({
                tenantId: TENANT_ID,
                name: "Autumn",
                status: "ACTIVE",
              }),
            ]),
          },
        }),
      }),
    );
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorUserId: ACTOR_ID,
          tenantId: TENANT_ID,
          orgId: ORG_ID,
          action: "CREATED",
          metadata: expect.objectContaining({ reason: command().reason }),
        }),
      }),
    );
    expect(tx.outboxEvent.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            aggregateType: "ACADEMIC_YEAR",
            aggregateId: "year-1",
            eventType: "ace.academic-year.created",
            payload: { periodCount: 2 },
          }),
        ],
      }),
    );
  });

  it("rejects overlapping periods before storing any academic calendar rows", async () => {
    const { service, tx } = createService();
    const invalid = command();
    invalid.periods[1] = {
      name: "Spring",
      startsOn: "2026-12-18",
      endsOn: "2027-03-26",
    };

    await expect(service.create(invalid, actor())).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tx.academicYear.create).not.toHaveBeenCalled();
  });

  it("translates the one-active-year database constraint into a conflict", async () => {
    const { service, tx } = createService();
    tx.tenant.findFirst.mockResolvedValue({ timezone: "Europe/London" });
    tx.academicYear.create.mockRejectedValue({ code: "P2002" });

    await expect(service.create(command(), actor())).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("only translates an active-period exclusion violation into a conflict", async () => {
    const { service, tx } = createService();
    tx.tenant.findFirst.mockResolvedValue({ timezone: "Europe/London" });
    tx.academicYear.create.mockRejectedValue({
      code: "P2010",
      meta: { code: "23514" },
    });

    await expect(service.create(command(), actor())).rejects.toEqual({
      code: "P2010",
      meta: { code: "23514" },
    });

    tx.academicYear.create.mockRejectedValue({
      code: "P2010",
      meta: { code: "23P01" },
    });
    await expect(service.create(command(), actor())).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("requires an active-site IANA timezone before calendar creation", async () => {
    const { service, tx } = createService();
    tx.tenant.findFirst.mockResolvedValue({ timezone: "not/a-timezone" });

    await expect(service.create(command(), actor())).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tx.academicYear.create).not.toHaveBeenCalled();
  });

  it("requires a non-empty reason and a complete actor identity", async () => {
    const { service, tx } = createService();
    const withoutReason = { ...command(), reason: "   " };

    await expect(service.create(withoutReason, actor())).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.create(command(), { ...actor(), userId: "" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.academicYear.create).not.toHaveBeenCalled();
  });

  it("returns the tenant's academic years with period statuses", async () => {
    const { service, tx } = createService();
    tx.tenant.findFirst.mockResolvedValue({ timezone: "Europe/London" });
    tx.academicYear.findMany.mockResolvedValue([createdYear()]);

    await expect(service.list(actor())).resolves.toEqual({
      timezone: "Europe/London",
      academicYears: [
        {
          id: "year-1",
          name: "2026/27",
          startsOn: "2026-09-01",
          endsOn: "2027-07-31",
          status: "ACTIVE",
          periods: [
            {
              id: "period-1",
              name: "Autumn",
              startsOn: "2026-09-01",
              endsOn: "2026-12-18",
              status: "ACTIVE",
            },
          ],
        },
      ],
    });
  });
});
