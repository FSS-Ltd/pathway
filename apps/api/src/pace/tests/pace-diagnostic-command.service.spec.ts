import "reflect-metadata";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import { recordAuditEventInTransaction } from "../../audit/audit.service";
import { REQUIRED_PERMISSION } from "../../access-control/require-permission.decorator";
import {
  recordPaceDiagnosticSchema,
  retractPaceDiagnosticSchema,
} from "../dto/pace-diagnostic-command.dto";
import { PaceController } from "../pace.controller";
import { PaceDiagnosticCommandService } from "../pace-diagnostic-command.service";

jest.mock("@pathway/db", () => ({
  withTenantRlsContext: jest.fn(),
  Prisma: {
    PrismaClientKnownRequestError: class extends Error {
      code: string;

      constructor(_message: string, options: { code: string }) {
        super(_message);
        this.code = options.code;
      }
    },
  },
}));
jest.mock("../../audit/audit.service", () => ({
  recordAuditEventInTransaction: jest.fn(),
}));

const actor = {
  tenantId: "d8e33493-1b58-49ae-afbc-45888ae2599d",
  orgId: "49bec0b1-cb6d-46c9-bfa7-ea6870401655",
  userId: "418ecbb5-a426-40c0-a726-1bfca13fcc25",
};
const childId = "41646897-7bb9-42be-9449-70a1550409b1";
const subjectId = "554119be-6e7c-4461-9fea-f1367343c7e3";
const resultId = "c00d9c2c-e4d6-4d26-a156-bde919a67af0";
const recordedAt = new Date("2026-10-06T08:00:00.000Z");

function setup() {
  const tx = {
    tenant: { findFirst: jest.fn().mockResolvedValue({ id: actor.tenantId }) },
    studentSubjectEnrollment: {
      findFirst: jest.fn().mockResolvedValue({ id: "enrollment-1" }),
    },
    paceDiagnosticResult: {
      create: jest.fn().mockResolvedValue({ id: resultId, recordedAt }),
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: resultId, retraction: null }),
    },
    paceDiagnosticRetraction: {
      create: jest.fn().mockResolvedValue({
        id: "retraction-1",
        retractedAt: recordedAt,
      }),
    },
  };
  const outbox = { enqueue: jest.fn() };
  jest
    .mocked(withTenantRlsContext)
    .mockImplementation(async (_tenant, _org, callback) =>
      callback(tx as never),
    );
  return { service: new PaceDiagnosticCommandService(outbox), tx, outbox };
}

describe("PACE diagnostic commands", () => {
  beforeEach(() => jest.clearAllMocks());

  it("guards both writes and rejects invalid commands at the boundary", () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION,
        PaceController.prototype.recordDiagnostic,
      ),
    ).toBe("ace.pace.diagnostics.manage");
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION,
        PaceController.prototype.retractDiagnostic,
      ),
    ).toBe("ace.pace.diagnostics.manage");
    expect(() =>
      recordPaceDiagnosticSchema.parse({
        childId,
        subjectId,
        level: 0,
        outcome: "PASS",
      }),
    ).toThrow();
    expect(() =>
      recordPaceDiagnosticSchema.parse({
        childId,
        subjectId,
        level: 3,
        outcome: "MAYBE",
      }),
    ).toThrow();
    expect(() =>
      retractPaceDiagnosticSchema.parse({ reason: "   " }),
    ).toThrow();
  });

  it("records an active-site enrollment without changing placement or progress", async () => {
    const { service, tx, outbox } = setup();
    const command = { childId, subjectId, level: 3, outcome: "PASS" as const };

    await expect(service.record(actor, command)).resolves.toEqual({
      id: resultId,
      recordedAt: recordedAt.toISOString(),
    });
    expect(tx.studentSubjectEnrollment.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: actor.tenantId,
        childId,
        subjectId,
        status: "ACTIVE",
        child: { isGuest: false },
        subject: { isActive: true },
      },
      select: { id: true },
    });
    expect(tx.paceDiagnosticResult.create).toHaveBeenCalledWith({
      data: {
        tenantId: actor.tenantId,
        childId,
        subjectId,
        enrollmentId: "enrollment-1",
        level: 3,
        outcome: "PASS",
        recordedByUserId: actor.userId,
      },
      select: { id: true, recordedAt: true },
    });
    expect(recordAuditEventInTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        tenantId: actor.tenantId,
        orgId: actor.orgId,
        actorUserId: actor.userId,
        entityId: resultId,
      }),
    );
    expect(outbox.enqueue).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        aggregateId: resultId,
        eventType: "ace.pace.diagnostic.recorded",
      }),
    );
    expect(withTenantRlsContext).toHaveBeenCalledWith(
      actor.tenantId,
      actor.orgId,
      expect.any(Function),
    );
  });

  it("denies an inactive site or missing enrollment before writing", async () => {
    const { service, tx, outbox } = setup();
    const command = { childId, subjectId, level: 2, outcome: "FAIL" as const };
    tx.tenant.findFirst.mockResolvedValueOnce(null);
    await expect(service.record(actor, command)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    tx.studentSubjectEnrollment.findFirst.mockResolvedValueOnce(null);
    await expect(service.record(actor, command)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tx.paceDiagnosticResult.create).not.toHaveBeenCalled();
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it("retracts a historical result and rejects an existing or concurrent retraction", async () => {
    const { service, tx, outbox } = setup();
    await expect(
      service.retract(actor, resultId, { reason: "Wrong sheet" }),
    ).resolves.toEqual({
      id: "retraction-1",
      resultId,
      retractedAt: recordedAt.toISOString(),
    });
    expect(tx.paceDiagnosticResult.findFirst).toHaveBeenCalledWith({
      where: { id: resultId, tenantId: actor.tenantId },
      select: { id: true, retraction: { select: { id: true } } },
    });
    expect(outbox.enqueue).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ eventType: "ace.pace.diagnostic.retracted" }),
    );

    tx.paceDiagnosticResult.findFirst.mockResolvedValueOnce({
      id: resultId,
      retraction: { id: "retraction-1" },
    });
    await expect(
      service.retract(actor, resultId, { reason: "Again" }),
    ).rejects.toBeInstanceOf(ConflictException);
    tx.paceDiagnosticRetraction.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("unique", {
        code: "P2002",
        clientVersion: "test",
      }),
    );
    await expect(
      service.retract(actor, resultId, { reason: "Again" }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("does not emit an outbox event if audit insertion fails", async () => {
    const { service, outbox } = setup();
    jest
      .mocked(recordAuditEventInTransaction)
      .mockRejectedValueOnce(new Error("audit failed"));
    await expect(
      service.record(actor, { childId, subjectId, level: 1, outcome: "FAIL" }),
    ).rejects.toThrow("audit failed");
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });
});
