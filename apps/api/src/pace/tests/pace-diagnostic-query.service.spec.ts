import "reflect-metadata";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { REQUIRED_PERMISSION } from "../../access-control/require-permission.decorator";
import { paceDiagnosticQuerySchema } from "../dto/pace-diagnostic-query.dto";
import { PaceController } from "../pace.controller";
import { PaceDiagnosticQueryService } from "../pace-diagnostic-query.service";

jest.mock("@pathway/db", () => ({ withTenantRlsContext: jest.fn() }));

const actor = {
  tenantId: "d8e33493-1b58-49ae-afbc-45888ae2599d",
  orgId: "49bec0b1-cb6d-46c9-bfa7-ea6870401655",
  userId: "418ecbb5-a426-40c0-a726-1bfca13fcc25",
};
const childId = "41646897-7bb9-42be-9449-70a1550409b1";
const subjectId = "554119be-6e7c-4461-9fea-f1367343c7e3";
const recordedAt = new Date("2026-10-06T08:00:00.000Z");

function setup() {
  const tx = {
    tenant: { findFirst: jest.fn().mockResolvedValue({ id: actor.tenantId }) },
    child: {
      findFirst: jest.fn().mockResolvedValue({
        id: childId,
        firstName: "Jordan",
        lastName: "Smith",
        preferredName: null,
      }),
    },
    subject: {
      findFirst: jest.fn().mockResolvedValue({ id: subjectId, name: "Maths" }),
    },
    paceDiagnosticResult: { findMany: jest.fn().mockResolvedValue([]) },
  };
  jest
    .mocked(withTenantRlsContext)
    .mockImplementation(async (_tenant, _org, callback) =>
      callback(tx as never),
    );
  return { service: new PaceDiagnosticQueryService(), tx };
}

describe("PACE diagnostic history", () => {
  beforeEach(() => jest.clearAllMocks());

  it("requires the diagnostic read permission and validates bounded filters", () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION,
        PaceController.prototype.diagnostics,
      ),
    ).toBe("ace.pace.diagnostics.read");
    expect(() =>
      paceDiagnosticQuerySchema.parse({ childId, subjectId, limit: "51" }),
    ).toThrow();
    expect(() =>
      paceDiagnosticQuerySchema.parse({
        childId,
        subjectId,
        tenantId: actor.tenantId,
      }),
    ).toThrow();
    expect(() =>
      paceDiagnosticQuerySchema.parse({
        childId,
        subjectId,
        includeRetracted: "false",
      }),
    ).toThrow();
  });

  it("returns only active facts for the selected child, subject and site", async () => {
    const { service, tx } = setup();
    tx.paceDiagnosticResult.findMany.mockResolvedValue([
      {
        id: "result-1",
        enrollmentId: "enrollment-1",
        level: 3,
        outcome: "PASS",
        recordedAt,
        recordedBy: { id: actor.userId, displayName: "Alex Lee", name: null },
        retraction: null,
      },
      { id: "result-2", recordedAt },
    ]);

    const result = await service.list(actor, { childId, subjectId, limit: 1 });

    expect(result.selection).toEqual({
      child: { id: childId, displayName: "Jordan Smith" },
      subject: { id: subjectId, name: "Maths" },
    });
    expect(result.items).toEqual([
      {
        id: "result-1",
        enrollmentId: "enrollment-1",
        level: 3,
        outcome: "PASS",
        recordedAt: recordedAt.toISOString(),
        recordedBy: { id: actor.userId, displayName: "Alex Lee" },
        retraction: null,
      },
    ]);
    expect(result.nextCursor).toEqual(expect.any(String));
    expect(tx.paceDiagnosticResult.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: actor.tenantId,
          childId,
          subjectId,
          retraction: { is: null },
        },
        take: 2,
      }),
    );
    expect(withTenantRlsContext).toHaveBeenCalledWith(
      actor.tenantId,
      actor.orgId,
      expect.any(Function),
    );
  });

  it("includes retraction history only on request and scopes cursors to that view", async () => {
    const { service, tx } = setup();
    tx.paceDiagnosticResult.findMany.mockResolvedValueOnce([
      {
        id: "result-1",
        enrollmentId: "enrollment-1",
        level: 4,
        outcome: "FAIL",
        recordedAt,
        recordedBy: { id: actor.userId, displayName: null, name: "Alex Lee" },
        retraction: {
          id: "retraction-1",
          reason: "Wrong sheet",
          retractedAt: recordedAt,
          retractedBy: {
            id: actor.userId,
            displayName: "Alex Lee",
            name: null,
          },
        },
      },
      { id: "result-2", recordedAt },
    ]);

    const page = await service.list(actor, {
      childId,
      subjectId,
      includeRetracted: "true",
      limit: 1,
    });
    expect(page.items[0].retraction).toEqual({
      id: "retraction-1",
      reason: "Wrong sheet",
      retractedAt: recordedAt.toISOString(),
      retractedBy: { id: actor.userId, displayName: "Alex Lee" },
    });
    expect(
      tx.paceDiagnosticResult.findMany.mock.calls[0][0].where,
    ).not.toHaveProperty("retraction");
    const cursor = page.nextCursor ?? "";
    await service.list(actor, {
      childId,
      subjectId,
      includeRetracted: "true",
      cursor,
    });
    expect(tx.paceDiagnosticResult.findMany.mock.calls[1][0].where.OR).toEqual([
      { recordedAt: { lt: recordedAt } },
      { recordedAt, id: { lt: "result-1" } },
    ]);
    await expect(
      service.list(actor, { childId, subjectId, cursor }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.list(
        { ...actor, tenantId: "another-site" },
        {
          childId,
          subjectId,
          includeRetracted: "true",
          cursor,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.list(actor, {
        childId: "451290c9-4c41-45d4-b7ee-9efb2b0a9381",
        subjectId,
        includeRetracted: "true",
        cursor,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.list(actor, {
        childId,
        subjectId: "b083500c-f32c-4c24-8a0c-b6285d6e1fe1",
        includeRetracted: "true",
        cursor,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects an inactive site or child outside the active site", async () => {
    const { service, tx } = setup();
    tx.tenant.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.list(actor, { childId, subjectId }),
    ).rejects.toBeInstanceOf(NotFoundException);
    tx.child.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.list(actor, { childId, subjectId }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.paceDiagnosticResult.findMany).not.toHaveBeenCalled();
  });
});
