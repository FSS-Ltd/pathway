import { AuditEntityType } from "@pathway/db";
import {
  RetentionService,
  type RetentionPrismaClient,
} from "../retention.service";
import { RetentionConfigService } from "../retention-config.service";

const prismaMock: Record<string, Record<string, jest.Mock>> = {
  tenant: { findMany: jest.fn() },
  staffActivity: { deleteMany: jest.fn() },
  attendance: { deleteMany: jest.fn() },
  auditEvent: { deleteMany: jest.fn() },
};

const withTenantRlsContextMock = jest
  .fn()
  .mockImplementation(
    async (
      tenantId: string,
      orgId: string,
      callback: (tx: RetentionPrismaClient) => Promise<unknown> | unknown,
    ) => callback(prismaMock as unknown as RetentionPrismaClient),
  );

jest.mock("@pathway/db", () => {
  const actual = jest.requireActual("@pathway/db");
  return {
    ...actual,
    get prisma() {
      return prismaMock;
    },
    withTenantRlsContext: (...args: unknown[]) =>
      withTenantRlsContextMock(...args),
  };
});

describe("RetentionService", () => {
  const config: jest.Mocked<RetentionConfigService> = {
    resolveForOrg: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RETENTION_ENABLED = "true";
    prismaMock.tenant.findMany.mockReset();
    prismaMock.staffActivity.deleteMany.mockReset();
    prismaMock.attendance.deleteMany.mockReset();
    prismaMock.auditEvent.deleteMany.mockReset();
  });

  it("skips when RETENTION_ENABLED is not true", async () => {
    process.env.RETENTION_ENABLED = "false";
    const svc = new RetentionService(
      config as unknown as RetentionConfigService,
      prismaMock as unknown as RetentionPrismaClient,
    );
    await svc.run(new Date("2025-01-31T00:00:00Z"));
    expect(prismaMock.tenant.findMany).not.toHaveBeenCalled();
  });

  it("deletes old records per tenant", async () => {
    prismaMock.tenant.findMany.mockResolvedValue([
      { id: "t1", orgId: "o1" },
      { id: "t2", orgId: "o2" },
    ]);
    config.resolveForOrg.mockResolvedValue({
      attendanceRetentionDays: 10,
      staffActivityRetentionDays: 5,
      auditEventRetentionDays: 7,
    });
    prismaMock.staffActivity.deleteMany.mockResolvedValue({ count: 2 });
    prismaMock.attendance.deleteMany.mockResolvedValue({ count: 3 });
    prismaMock.auditEvent.deleteMany.mockResolvedValue({ count: 1 });

    const svc = new RetentionService(
      config as unknown as RetentionConfigService,
      prismaMock as unknown as RetentionPrismaClient,
    );
    await svc.run(new Date("2025-02-01T00:00:00Z"));

    expect(prismaMock.tenant.findMany).toHaveBeenCalledTimes(1);
    expect(withTenantRlsContextMock).toHaveBeenCalledWith(
      "t1",
      "o1",
      expect.any(Function),
    );
    expect(prismaMock.attendance.deleteMany).toHaveBeenCalled();
    expect(prismaMock.staffActivity.deleteMany).toHaveBeenCalled();
    expect(prismaMock.auditEvent.deleteMany).toHaveBeenCalled();
  });

  it("preserves Finance audit evidence and other scopes while purging eligible local audit records", async () => {
    const now = new Date("2026-10-23T12:00:00Z");
    const old = new Date("2020-01-01T00:00:00Z");
    const records = [
      {
        id: "finance-report",
        tenantId: "t1",
        orgId: "o1",
        entityType: AuditEntityType.FINANCE_REPORT,
        createdAt: old,
      },
      {
        id: "finance-account",
        tenantId: "t1",
        orgId: "o1",
        entityType: AuditEntityType.FINANCE_PAYER_ACCOUNT,
        createdAt: old,
      },
      {
        id: "eligible",
        tenantId: "t1",
        orgId: "o1",
        entityType: AuditEntityType.CONCERN,
        createdAt: old,
      },
      {
        id: "recent",
        tenantId: "t1",
        orgId: "o1",
        entityType: AuditEntityType.CONCERN,
        createdAt: now,
      },
      {
        id: "other-tenant",
        tenantId: "t2",
        orgId: "o1",
        entityType: AuditEntityType.CONCERN,
        createdAt: old,
      },
      {
        id: "other-org",
        tenantId: "t1",
        orgId: "o2",
        entityType: AuditEntityType.CONCERN,
        createdAt: old,
      },
    ];
    let retained = [...records];
    prismaMock.tenant.findMany.mockResolvedValue([{ id: "t1", orgId: "o1" }]);
    config.resolveForOrg.mockResolvedValue({
      attendanceRetentionDays: 10,
      staffActivityRetentionDays: 5,
      auditEventRetentionDays: 7,
    });
    prismaMock.staffActivity.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.attendance.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.auditEvent.deleteMany.mockImplementation(
      async ({
        where,
      }: {
        where: {
          tenantId?: string;
          orgId?: string;
          createdAt: { lt: Date };
          entityType?: { notIn: AuditEntityType[] };
        };
      }) => {
        const before = retained.length;
        retained = retained.filter(
          (row) =>
            !(
              (!where.tenantId || row.tenantId === where.tenantId) &&
              (!where.orgId || row.orgId === where.orgId) &&
              row.createdAt < where.createdAt.lt &&
              !where.entityType?.notIn.includes(row.entityType)
            ),
        );
        return { count: before - retained.length };
      },
    );
    await new RetentionService(
      config,
      prismaMock as unknown as RetentionPrismaClient,
    ).run(now);
    expect(retained.map((row) => row.id)).toEqual([
      "finance-report",
      "finance-account",
      "recent",
      "other-tenant",
      "other-org",
    ]);
  });
});
