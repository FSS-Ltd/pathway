import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import type { EffectivePermissionsService } from "../../access-control/effective-permissions.service";
import { OutboxService } from "../../common/outbox/outbox.service";
import { BehaviourRetractionService } from "../behaviour-retraction.service";

jest.mock("@pathway/db", () => ({
  Prisma: {
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings: [...strings],
      values,
    }),
  },
  withTenantRlsContext: jest.fn(),
}));

const actor = { tenantId: "tenant-1", orgId: "org-1", userId: "head-1" };
const entryId = "entry-1";
const childId = "child-1";
const command = {
  idempotencyKey: "void-1",
  reason: "Recorded against the wrong event",
};

function arrange() {
  const tx = {
    tenant: { findFirst: jest.fn().mockResolvedValue({ id: actor.tenantId }) },
    $queryRaw: jest.fn().mockResolvedValue([{ userId: actor.userId }]),
    $executeRaw: jest.fn().mockResolvedValue(0),
    behaviourEntry: { findFirst: jest.fn() },
    behaviourEntryRetraction: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: "retraction-1",
        retractedAt: new Date("2026-10-11T09:00:00Z"),
      }),
    },
    auditEvent: { create: jest.fn().mockResolvedValue({}) },
    outboxEvent: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirstOrThrow: jest.fn().mockResolvedValue({ id: "outbox-1" }),
    },
  };
  tx.behaviourEntry.findFirst
    .mockResolvedValueOnce({ id: entryId, childId })
    .mockResolvedValueOnce({
      id: entryId,
      childId,
      type: "MERIT",
      visibility: "GENERAL",
      pointsDelta: 3,
      correction: null,
      retraction: null,
    });
  jest
    .mocked(withTenantRlsContext)
    .mockImplementation(async (_tenantId, _orgId, callback) =>
      callback(tx as never),
    );
  const permissions = {
    resolve: jest.fn().mockResolvedValue({ allowed: true }),
  };
  const service = new BehaviourRetractionService(
    permissions as unknown as EffectivePermissionsService,
    new OutboxService(),
  );
  return { tx, permissions, service };
}

describe("BehaviourRetractionService", () => {
  beforeEach(() => jest.clearAllMocks());

  it("requires a fixed Head or Site Lead role even when the route permission is granted", async () => {
    const { tx, service } = arrange();
    tx.$queryRaw.mockResolvedValue([]);
    await expect(
      service.retract(entryId, command, actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.behaviourEntryRetraction.create).not.toHaveBeenCalled();
  });

  it("rejects cross-site targets and superseded or already retracted facts", async () => {
    const crossSite = arrange();
    crossSite.tx.behaviourEntry.findFirst.mockReset().mockResolvedValue(null);
    await expect(
      crossSite.service.retract(entryId, command, actor),
    ).rejects.toBeInstanceOf(NotFoundException);

    const superseded = arrange();
    superseded.tx.behaviourEntry.findFirst
      .mockReset()
      .mockResolvedValueOnce({ id: entryId, childId })
      .mockResolvedValueOnce({
        id: entryId,
        childId,
        visibility: "GENERAL",
        correction: { id: "next" },
        retraction: null,
      });
    await expect(
      superseded.service.retract(entryId, command, actor),
    ).rejects.toBeInstanceOf(ConflictException);

    const retracted = arrange();
    retracted.tx.behaviourEntry.findFirst
      .mockReset()
      .mockResolvedValueOnce({ id: entryId, childId })
      .mockResolvedValueOnce({
        id: entryId,
        childId,
        visibility: "GENERAL",
        correction: null,
        retraction: { id: "old" },
      });
    await expect(
      retracted.service.retract(entryId, command, actor),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("writes an append-only audit event and a single negative Merit adjustment", async () => {
    const { tx, service } = arrange();
    await expect(
      service.retract(entryId, command, actor),
    ).resolves.toMatchObject({
      id: "retraction-1",
      entryId,
      duplicate: false,
    });
    expect(tx.behaviourEntryRetraction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: actor.tenantId,
        childId,
        entryId,
        reason: command.reason,
        retractedByUserId: actor.userId,
      }),
      select: { id: true, retractedAt: true },
    });
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityId: entryId,
          metadata: expect.objectContaining({
            operation: "BEHAVIOUR_ENTRY_RETRACTED",
            retractionId: "retraction-1",
          }),
        }),
      }),
    );
    expect(tx.outboxEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          eventType: "behaviour.merit-awarded",
          payload: expect.objectContaining({
            pointsDelta: -3,
            retractionId: "retraction-1",
          }),
        }),
      ],
      skipDuplicates: true,
    });
  });

  it("replays the same command without a second adjustment and refuses a changed payload", async () => {
    const { tx, service } = arrange();
    await service.retract(entryId, command, actor);
    const created = tx.behaviourEntryRetraction.create.mock.calls[0]?.[0];
    tx.behaviourEntry.findFirst
      .mockReset()
      .mockResolvedValue({ id: entryId, childId });
    tx.behaviourEntryRetraction.findFirst.mockResolvedValue({
      id: "retraction-1",
      entryId,
      retractedAt: new Date("2026-10-11T09:00:00Z"),
      commandFingerprint: created.data.commandFingerprint,
      entry: { visibility: "GENERAL" },
    });
    await expect(
      service.retract(entryId, command, actor),
    ).resolves.toMatchObject({ duplicate: true });
    await expect(
      service.retract(
        entryId,
        { ...command, reason: "Different reason" },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.outboxEvent.createMany).toHaveBeenCalledTimes(1);
  });

  it("requires sensitive-read permission before voiding a sensitive fact", async () => {
    const { tx, service, permissions } = arrange();
    permissions.resolve.mockResolvedValue({ allowed: false });
    tx.behaviourEntry.findFirst
      .mockReset()
      .mockResolvedValueOnce({ id: entryId, childId })
      .mockResolvedValueOnce({
        id: entryId,
        childId,
        visibility: "SENSITIVE",
        correction: null,
        retraction: null,
      });
    await expect(
      service.retract(entryId, command, actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.behaviourEntryRetraction.create).not.toHaveBeenCalled();
  });
});
