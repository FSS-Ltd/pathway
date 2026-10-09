import "reflect-metadata";
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { prisma, withTenantRlsContext } from "@pathway/db";
import type { EffectivePermissionsService } from "../../access-control/effective-permissions.service";
import { recordAuditEventInTransaction } from "../../audit/audit.service";
import type { OutboxService } from "../../common/outbox/outbox.service";
import { DemeritStageService } from "../demerit-stage.service";

jest.mock("@pathway/db", () => ({
  ...jest.requireActual("@pathway/db"),
  prisma: {
    user: { findUnique: jest.fn().mockResolvedValue({ isActive: true }) },
  },
  withTenantRlsContext: jest.fn(),
}));
jest.mock("../../audit/audit.service", () => ({
  recordAuditEventInTransaction: jest.fn(),
}));

const actor = { tenantId: "site-1", orgId: "org-1", userId: "head-1" };
const command = {
  childId: "child-1",
  stage: 3,
  expectedPolicyVersion: 4,
  reason: "Escalation discussed with staff",
  idempotencyKey: "request-1",
};

function arrange(
  options: {
    allowed?: boolean;
    reviewer?: boolean;
    staff?: boolean;
    priorUnits?: number;
  } = {},
) {
  const tx = {
    tenant: {
      findFirst: jest.fn().mockResolvedValue({ timezone: "Europe/London" }),
    },
    child: { findFirst: jest.fn().mockResolvedValue({ id: "child-1" }) },
    orgVertical: {
      findFirst: jest.fn().mockResolvedValue({ orgId: actor.orgId }),
    },
    siteMembership: {
      findFirst: jest
        .fn()
        .mockResolvedValue(options.staff === false ? null : { id: "staff-1" }),
    },
    orgMembership: { findFirst: jest.fn().mockResolvedValue(null) },
    $queryRaw: jest
      .fn()
      .mockResolvedValue(
        options.reviewer === false ? [] : [{ userId: actor.userId }],
      ),
    demeritPolicy: {
      findFirst: jest.fn().mockResolvedValue({
        id: "policy-4",
        version: 4,
        windowDays: 30,
        stageOneThreshold: 3,
        stageTwoThreshold: 6,
        stageThreeThreshold: 10,
        seriousMisconductStage: 3,
      }),
    },
    behaviourEntry: {
      findMany: jest.fn().mockResolvedValue(
        options.priorUnits
          ? [
              {
                pointsDelta: -options.priorUnits,
                categoryIsSerious: false,
                occurredAt: new Date("2026-10-24T09:00:00Z"),
              },
            ]
          : [],
      ),
    },
    demeritStageOverride: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest
        .fn()
        .mockImplementation(
          ({
            data,
          }: {
            data: { expiresAt: Date; commandFingerprint: string };
          }) => ({
            id: "override-1",
            stage: 3,
            expiresAt: data.expiresAt,
          }),
        ),
    },
    behaviourReviewRequest: { create: jest.fn().mockResolvedValue({}) },
    $executeRaw: jest.fn().mockResolvedValue(0),
  };
  jest
    .mocked(withTenantRlsContext)
    .mockImplementation(async (_tenantId, _orgId, callback) =>
      callback(tx as never),
    );
  const permissions = {
    resolve: jest
      .fn()
      .mockResolvedValue({ allowed: options.allowed !== false }),
  };
  const outbox = { enqueue: jest.fn().mockResolvedValue({}) };
  const service = new DemeritStageService(
    permissions as unknown as EffectivePermissionsService,
    outbox as unknown as OutboxService,
  );
  return { tx, permissions, outbox, service };
}

describe("DemeritStageService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Prisma's generic mock type expects a full User although the service selects only isActive.
    jest
      .mocked(prisma.user.findUnique)
      .mockResolvedValue({ isActive: true } as never);
    jest.useFakeTimers().setSystemTime(new Date("2026-10-25T12:00:00Z"));
  });
  afterEach(() => jest.useRealTimers());

  it("reads the site-local day and evaluates the rolling stage", async () => {
    const { tx, service } = arrange({ priorUnits: 7 });
    await expect(
      service.status(actor, "child-1", "2026-10-25"),
    ).resolves.toEqual(
      expect.objectContaining({
        policyVersion: 4,
        stage: 2,
        stageLabel: "Guardian notice",
        action: "notify",
        manualStage: null,
      }),
    );
    expect(tx.behaviourEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: actor.tenantId,
          childId: "child-1",
        }),
      }),
    );
  });

  it("denies the complete status without Sensitive access", async () => {
    const { tx, service } = arrange({ allowed: false });
    await expect(
      service.status(actor, "child-1", "2026-10-25"),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.behaviourEntry.findMany).not.toHaveBeenCalled();
  });

  it("denies an inactive staff account before reading stages", async () => {
    const { tx, service } = arrange();
    jest
      .mocked(prisma.user.findUnique)
      .mockResolvedValue({ isActive: false } as never);
    await expect(
      service.status(actor, "child-1", "2026-10-25"),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.behaviourEntry.findMany).not.toHaveBeenCalled();
  });

  it("denies a guardian with a permission tag but no staff or reviewer role", async () => {
    const { tx, service } = arrange({ reviewer: false, staff: false });
    await expect(
      service.status(actor, "child-1", "2026-10-25"),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.behaviourEntry.findMany).not.toHaveBeenCalled();
  });

  it("does not expose a child outside the active site", async () => {
    const { tx, service } = arrange();
    tx.child.findFirst.mockResolvedValue(null);
    await expect(
      service.status(actor, "child-1", "2026-10-25"),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.behaviourEntry.findMany).not.toHaveBeenCalled();
  });

  it("rejects a permission-tag holder without a current fixed reviewer role", async () => {
    const { tx, service } = arrange({ reviewer: false });
    await expect(service.override(actor, command)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(tx.demeritStageOverride.create).not.toHaveBeenCalled();
  });

  it("serializes and appends a higher override with DST-safe local-midnight expiry", async () => {
    const { tx, outbox, service } = arrange({ priorUnits: 4 });
    await expect(service.override(actor, command)).resolves.toEqual({
      id: "override-1",
      stage: 3,
      expiresAt: new Date("2026-10-26T00:00:00Z"),
      duplicate: false,
    });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(tx.demeritStageOverride.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          demeritPolicyId: "policy-4",
          authorisedByUserId: actor.userId,
        }),
      }),
    );
    expect(tx.behaviourReviewRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: "HEAD",
        demeritStageOverrideId: "override-1",
      }),
    });
    expect(outbox.enqueue).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        eventType: "behaviour.review-requested",
        payload: expect.not.objectContaining({ reason: command.reason }),
      }),
    );
    expect(recordAuditEventInTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        metadata: expect.objectContaining({ reason: command.reason }),
      }),
    );
  });

  it("rejects a stage that does not exceed the current stage", async () => {
    const { tx, service } = arrange({ priorUnits: 11 });
    await expect(service.override(actor, command)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.demeritStageOverride.create).not.toHaveBeenCalled();
  });

  it("replays an identical override without exposing its command fingerprint", async () => {
    const { tx, service } = arrange();
    await service.override(actor, command);
    const createdData = tx.demeritStageOverride.create.mock.calls[0]?.[0].data;
    tx.demeritStageOverride.findFirst.mockResolvedValue({
      id: "override-1",
      stage: 3,
      expiresAt: new Date("2026-10-26T00:00:00Z"),
      commandFingerprint: createdData.commandFingerprint,
    });
    await expect(service.override(actor, command)).resolves.toEqual({
      id: "override-1",
      stage: 3,
      expiresAt: new Date("2026-10-26T00:00:00Z"),
      duplicate: true,
    });
    expect(tx.demeritStageOverride.create).toHaveBeenCalledTimes(1);
  });

  it("returns no stage when the site has no active policy", async () => {
    const { tx, service } = arrange();
    tx.demeritPolicy.findFirst.mockResolvedValue(null);
    await expect(
      service.status(actor, "child-1", "2026-10-25"),
    ).resolves.toBeNull();
    expect(tx.behaviourEntry.findMany).not.toHaveBeenCalled();
  });
});
