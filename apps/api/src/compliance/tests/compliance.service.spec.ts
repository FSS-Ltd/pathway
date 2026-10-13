import "reflect-metadata";
import { Test } from "@nestjs/testing";
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { EffectivePermissionsService } from "../../access-control/effective-permissions.service";
import { recordAuditEventInTransaction } from "../../audit/audit.service";
import { ComplianceService } from "../compliance.service";

jest.mock("@pathway/db", () => ({ withTenantRlsContext: jest.fn() }));
jest.mock("../../audit/audit.service", () => ({
  recordAuditEventInTransaction: jest.fn(),
}));
const actor = { tenantId: "site", orgId: "org", userId: "actor" };
const input = {
  subjectName: "A Person",
  subjectUserId: null,
  roleDescription: "Volunteer",
  kind: "BACKGROUND_CHECK" as const,
  scheme: "DBS" as const,
  title: "Enhanced check",
  provider: null,
  reference: null,
  completedOn: "2026-01-01",
  reviewDueOn: null,
  status: "VERIFIED" as const,
  notes: null,
  verificationNotes: "Original seen",
};
const row = {
  ...input,
  id: "record",
  version: 1,
  tenantId: "site",
  orgId: "org",
  completedOn: new Date("2026-01-01"),
  reviewDueOn: null,
  verifiedAt: new Date("2026-01-02"),
  verifiedByUserId: "actor",
  archivedAt: null,
  createdAt: new Date("2026-01-02"),
  updatedAt: new Date("2026-01-02"),
  createdByUserId: "actor",
  updatedByUserId: "actor",
};
async function setup() {
  const permission = {
    resolve: jest.fn().mockResolvedValue({ allowed: true }),
  };
  const tx = {
    tenant: { findFirst: jest.fn().mockResolvedValue({ id: "site" }) },
    user: {
      findFirst: jest.fn().mockResolvedValue({ id: "person" }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    compliancePersonnelRecord: {
      findFirst: jest.fn().mockResolvedValue(row),
      create: jest.fn().mockResolvedValue(row),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([row]),
      count: jest.fn().mockResolvedValue(1),
    },
    compliancePersonnelRevision: {
      create: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  // Prisma's generated transaction surface is much wider than this focused test double.
  jest
    .mocked(withTenantRlsContext)
    .mockImplementation(async (_tenant, _org, operation) =>
      operation(tx as never),
    );
  const module = await Test.createTestingModule({
    providers: [
      ComplianceService,
      { provide: EffectivePermissionsService, useValue: permission },
    ],
  }).compile();
  return { service: module.get(ComplianceService), tx, permission };
}
describe("ComplianceService", () => {
  beforeEach(() => jest.clearAllMocks());
  it("denies permission before opening a data transaction", async () => {
    const { service, permission } = await setup();
    permission.resolve.mockResolvedValue({ allowed: false });
    await expect(service.get("record", actor)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(withTenantRlsContext).not.toHaveBeenCalled();
  });
  it("rejects a tenant belonging to another organisation", async () => {
    const { service, tx } = await setup();
    tx.tenant.findFirst.mockResolvedValue(null);
    await expect(service.get("record", actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tx.compliancePersonnelRecord.findFirst).not.toHaveBeenCalled();
  });
  it("creates server verification stamps and transactional history without sensitive audit metadata", async () => {
    const { service, tx } = await setup();
    const result = await service.create(input, actor);
    expect(result.completedOn).toBe("2026-01-01");
    expect(tx.compliancePersonnelRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        verifiedByUserId: "actor",
        verifiedAt: expect.any(Date),
        orgId: "org",
        tenantId: "site",
      }),
    });
    expect(tx.compliancePersonnelRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        snapshot: result,
        version: 1,
        actorUserId: "actor",
      }),
    });
    expect(
      JSON.stringify(jest.mocked(recordAuditEventInTransaction).mock.calls),
    ).not.toContain("Original seen");
  });
  it("does not append history or audit when optimistic concurrency loses", async () => {
    const { service, tx } = await setup();
    tx.compliancePersonnelRecord.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.update("record", input, 1, actor),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.compliancePersonnelRevision.create).not.toHaveBeenCalled();
    expect(recordAuditEventInTransaction).not.toHaveBeenCalled();
  });
  it("rejects a linked subject outside the active site", async () => {
    const { service, tx } = await setup();
    tx.user.findFirst.mockResolvedValue(null);
    await expect(
      service.create({ ...input, subjectUserId: "foreign" }, actor),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.compliancePersonnelRecord.create).not.toHaveBeenCalled();
  });
  it("rejects foreign cursors instead of using them across sites", async () => {
    const { service, tx } = await setup();
    tx.compliancePersonnelRecord.findFirst.mockResolvedValue(null);
    await expect(
      service.list({ cursor: "foreign" }, actor),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.compliancePersonnelRecord.findMany).not.toHaveBeenCalled();
  });
  it("prevents editing archived records", async () => {
    const { service, tx } = await setup();
    tx.compliancePersonnelRecord.findFirst.mockResolvedValue({
      ...row,
      archivedAt: new Date(),
    });
    await expect(
      service.update("record", input, 1, actor),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.compliancePersonnelRecord.updateMany).not.toHaveBeenCalled();
  });
  it("allows corrections after an unchanged linked person has left the site", async () => {
    const { service, tx } = await setup();
    tx.compliancePersonnelRecord.findFirst.mockResolvedValue({
      ...row,
      subjectUserId: "departed",
    });
    await service.update(
      "record",
      { ...input, subjectUserId: "departed" },
      1,
      actor,
    );
    expect(tx.user.findFirst).not.toHaveBeenCalled();
  });
  it("clears verifier stamps when an explicit edit returns a record to pending", async () => {
    const { service, tx } = await setup();
    await service.update("record", { ...input, status: "PENDING" }, 1, actor);
    expect(tx.compliancePersonnelRecord.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          verifiedAt: null,
          verifiedByUserId: null,
        }),
      }),
    );
  });
  it("requires management permission for restricted export", async () => {
    const { service, permission } = await setup();
    await service.exportRecord("record", undefined, actor);
    expect(permission.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ permission: "compliance.checks.manage" }),
    );
    expect(recordAuditEventInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "EXPORTED" }),
    );
  });
  it("bounds register pages while reporting site-wide active review counts", async () => {
    const { service, tx } = await setup();
    tx.compliancePersonnelRecord.findMany.mockResolvedValue(
      Array.from({ length: 51 }, (_, index) => ({
        ...row,
        id: `record-${index}`,
      })),
    );
    tx.compliancePersonnelRecord.count
      .mockResolvedValueOnce(51)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(3);
    const result = await service.list({}, actor);
    expect(result.items).toHaveLength(50);
    expect(recordAuditEventInTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: "VIEWED",
        actorUserId: actor.userId,
        metadata: {
          view: "register",
          recordIds: result.items.map((item) => item.id),
        },
      }),
    );
    expect(result.nextCursor).toBe("record-49");
    expect(result.summary).toEqual({
      active: 51,
      overdueReview: 4,
      awaitingVerification: 3,
    });
    expect(tx.compliancePersonnelRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 51,
        where: { tenantId: "site", orgId: "org", archivedAt: null },
      }),
    );
  });
  it("fails safely for unreadable retained history rather than exposing raw JSON", async () => {
    const { service, tx } = await setup();
    tx.compliancePersonnelRevision.findMany.mockResolvedValue([
      {
        id: "revision",
        version: 1,
        actorUserId: "actor",
        createdAt: new Date(),
        snapshot: { unexpected: "private malformed content" },
      },
    ]);
    await expect(service.history("record", undefined, actor)).rejects.toThrow(
      "Historical record is unavailable",
    );
    expect(recordAuditEventInTransaction).not.toHaveBeenCalled();
  });
  it("keeps a foreign revision cursor outside the active record", async () => {
    const { service, tx } = await setup();
    await expect(
      service.history("record", "foreign-revision", actor),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.compliancePersonnelRevision.findMany).not.toHaveBeenCalled();
  });
});
