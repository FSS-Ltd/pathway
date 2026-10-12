import "reflect-metadata";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { REQUIRED_PERMISSION } from "../../access-control/require-permission.decorator";
import type { EffectivePermissionsService } from "../../access-control/effective-permissions.service";
import { OutboxService } from "../../common/outbox/outbox.service";
import { BehaviourCommandService } from "../behaviour-command.service";
import type { DemeritEscalationService } from "../demerit-escalation.service";
import {
  behaviourClientCommandKeyHash,
  behaviourCommandFingerprint,
} from "../behaviour-entry.support";
import { BehaviourQueryService } from "../behaviour-query.service";
import { BehaviourController } from "../behaviour.controller";
import {
  behaviourCorrectionSchema,
  behaviourListQuerySchema,
  createBehaviourEntrySchema,
  type BehaviourCorrectionDto,
  type CreateBehaviourEntryDto,
} from "../dto/behaviour-entry.dto";

jest.mock("@pathway/db", () => ({
  Prisma: {
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings: [...strings],
      values,
    }),
  },
  withTenantRlsContext: jest.fn(),
}));

const actor = { tenantId: "tenant-1", orgId: "org-1", userId: "user-1" };
const childId = "5dce6037-f0e3-46e6-8463-2013e4251ed0";
const originalId = "7a7450c4-54ad-407e-8388-90185ff9a5f6";
const occurredAt = "2026-08-12T09:30:00.000Z";

function command(
  overrides: Partial<CreateBehaviourEntryDto> = {},
): CreateBehaviourEntryDto {
  return {
    idempotencyKey: "behaviour-command-1",
    childId,
    category: "service",
    type: "MERIT",
    visibility: "GENERAL",
    pointsDelta: 3,
    occurredAt,
    reason: "Recognised by the supervising member of staff",
    note: "Helped another learner prepare their workspace",
    ...overrides,
  };
}

function correction(
  overrides: Partial<BehaviourCorrectionDto> = {},
): BehaviourCorrectionDto {
  return {
    ...command({
      idempotencyKey: "behaviour-correction-1",
      reason: "Correcting the points awarded",
      pointsDelta: 2,
    }),
    ...overrides,
  };
}

function entry(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "entry-1",
    childId,
    category: "service",
    categoryPolicyVersion: 3,
    categoryIsSerious: false,
    type: "MERIT",
    visibility: "GENERAL",
    pointsDelta: 3,
    occurredAt: new Date(occurredAt),
    recordedByUserId: "user-1",
    reason: "Recognised by the supervising member of staff",
    note: "Helped another learner prepare their workspace",
    correctsBehaviourEntryId: null,
    clientCommandKeyHash: "client-key-hash",
    commandFingerprint: "command-fingerprint",
    createdAt: new Date("2026-08-12T09:31:00.000Z"),
    ...overrides,
  };
}

function transaction() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(0),
    tenant: { findFirst: jest.fn() },
    child: { findFirst: jest.fn() },
    behaviourCategory: { aggregate: jest.fn(), findFirst: jest.fn() },
    behaviourEntry: {
      findFirst: jest.fn(),
      findFirstOrThrow: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    auditEvent: { create: jest.fn() },
    outboxEvent: {
      createMany: jest.fn(),
      findFirstOrThrow: jest.fn(),
    },
  };
}

function permissions(allowed = true) {
  return {
    resolve: jest.fn().mockResolvedValue({
      allowed,
      reason: allowed ? "allowed" : "permission-missing",
      sourceRoleIds: allowed ? ["role-1"] : [],
    }),
  };
}

function arrange(options: { sensitive?: boolean } = {}) {
  const tx = transaction();
  const effectivePermissions = permissions(options.sensitive ?? true);
  const demeritEscalation = {
    createIntents: jest.fn().mockResolvedValue(null),
  };
  jest
    .mocked(withTenantRlsContext)
    .mockImplementation(async (_tenantId, _orgId, callback) =>
      callback(tx as never),
    );
  tx.tenant.findFirst.mockResolvedValue({
    id: actor.tenantId,
    timezone: "Europe/London",
  });
  tx.child.findFirst.mockResolvedValue({ id: childId });
  tx.behaviourCategory.aggregate.mockResolvedValue({
    _max: { policyVersion: 3 },
  });
  tx.behaviourCategory.findFirst.mockResolvedValue({
    policyVersion: 3,
    code: "service",
    type: "MERIT",
    visibility: "GENERAL",
    isActive: true,
    isSerious: false,
  });
  tx.behaviourEntry.findFirst.mockResolvedValue(null);
  tx.behaviourEntry.findFirstOrThrow.mockResolvedValue(entry());
  tx.behaviourEntry.findMany.mockResolvedValue([]);
  tx.behaviourEntry.create.mockResolvedValue(entry());
  tx.auditEvent.create.mockResolvedValue({});
  tx.outboxEvent.createMany.mockResolvedValue({ count: 1 });
  tx.outboxEvent.findFirstOrThrow.mockResolvedValue({ id: "outbox-1" });
  return {
    tx,
    effectivePermissions,
    commandService: new BehaviourCommandService(
      new OutboxService(),
      effectivePermissions as unknown as EffectivePermissionsService,
      demeritEscalation as unknown as DemeritEscalationService,
    ),
    demeritEscalation,
    queryService: new BehaviourQueryService(
      effectivePermissions as unknown as EffectivePermissionsService,
    ),
  };
}

describe("behaviour entry boundary", () => {
  beforeEach(() => jest.clearAllMocks());

  it("uses the registered read and record permissions on create, list, and correction routes", () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION,
        BehaviourController.prototype.listEntries,
      ),
    ).toBe("ace.behaviour.read");
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION,
        BehaviourController.prototype.recordEntry,
      ),
    ).toBe("ace.behaviour.record");
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION,
        BehaviourController.prototype.correctEntry,
      ),
    ).toBe("ace.behaviour.record");
  });

  it("strictly validates bounded commands, queries, and type/delta consistency", () => {
    expect(createBehaviourEntrySchema.parse(command())).toMatchObject({
      type: "MERIT",
      pointsDelta: 3,
    });
    expect(behaviourCorrectionSchema.parse(correction())).toMatchObject({
      pointsDelta: 2,
    });
    expect(behaviourListQuerySchema.parse({ childId, limit: "25" })).toEqual({
      childId,
      limit: 25,
    });

    for (const invalid of [
      command({ type: "MERIT", pointsDelta: 0 }),
      command({ type: "DEMERIT", pointsDelta: 2 }),
      command({ type: "GENERAL", pointsDelta: -1 }),
      { ...command(), unexpected: true },
    ]) {
      expect(createBehaviourEntrySchema.safeParse(invalid).success).toBe(false);
    }
  });
});

describe("BehaviourCommandService", () => {
  beforeEach(() => jest.clearAllMocks());

  it("records the active category snapshot as an immutable fact with redacted audit and one merit intent", async () => {
    const { commandService, tx } = arrange();

    await expect(commandService.record(command(), actor)).resolves.toEqual({
      entry: expect.objectContaining({
        id: "entry-1",
        categoryPolicyVersion: 3,
        categoryIsSerious: false,
      }),
      duplicate: false,
    });

    expect(withTenantRlsContext).toHaveBeenCalledWith(
      actor.tenantId,
      actor.orgId,
      expect.any(Function),
    );
    expect(tx.tenant.findFirst).toHaveBeenCalledWith({
      where: { id: actor.tenantId, orgId: actor.orgId },
      select: { id: true, timezone: true },
    });
    expect(tx.child.findFirst).toHaveBeenCalledWith({
      where: { id: childId, tenantId: actor.tenantId },
      select: { id: true },
    });
    expect(tx.behaviourCategory.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: actor.tenantId,
        policyVersion: 3,
        code: "service",
      },
      select: expect.any(Object),
    });
    expect(tx.$executeRaw).toHaveBeenCalledWith(
      expect.objectContaining({ values: [`ace-settings:${actor.tenantId}`] }),
    );
    expect(tx.$executeRaw.mock.invocationCallOrder.at(-1)).toBeLessThan(
      tx.behaviourCategory.aggregate.mock.invocationCallOrder[0]!,
    );
    expect(tx.behaviourEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: actor.tenantId,
        childId,
        category: "service",
        categoryPolicyVersion: 3,
        categoryIsSerious: false,
        type: "MERIT",
        visibility: "GENERAL",
        pointsDelta: 3,
        recordedByUserId: actor.userId,
        reason: "Recognised by the supervising member of staff",
        note: "Helped another learner prepare their workspace",
        clientCommandKeyHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        commandFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
      select: expect.any(Object),
    });
    const auditData = tx.auditEvent.create.mock.calls[0]?.[0]?.data;
    expect(JSON.stringify(auditData)).not.toContain(command().note);
    expect(JSON.stringify(auditData)).not.toContain(command().reason);
    expect(tx.outboxEvent.createMany).toHaveBeenCalledTimes(1);
    expect(tx.outboxEvent.createMany).toHaveBeenCalledWith({
      data: [
        {
          aggregateType: "BEHAVIOUR_ENTRY",
          aggregateId: "entry-1",
          eventType: "behaviour.merit-awarded",
          payload: {
            behaviourEntryId: "entry-1",
            childId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            pointsDelta: 3,
            correctsBehaviourEntryId: null,
          },
          idempotencyKey: "behaviour-merit-awarded:entry-1",
        },
      ],
      skipDuplicates: true,
    });
  });

  it("applies demerit escalation inside the behaviour transaction and records the classified result in audit metadata", async () => {
    const { commandService, tx, demeritEscalation } = arrange();
    const demerit = command({
      category: "conduct",
      type: "DEMERIT",
      pointsDelta: -6,
    });
    const created = entry({
      category: "conduct",
      type: "DEMERIT",
      pointsDelta: -6,
    });
    tx.behaviourCategory.findFirst.mockResolvedValue({
      policyVersion: 3,
      code: "conduct",
      type: "DEMERIT",
      visibility: "GENERAL",
      isActive: true,
      isSerious: false,
    });
    tx.behaviourEntry.create.mockResolvedValue(created);
    demeritEscalation.createIntents.mockResolvedValue({
      stage: 2,
      action: "notify",
      policyVersion: 3,
      createdIntentCount: 1,
    });

    await commandService.record(demerit, actor);

    expect(demeritEscalation.createIntents).toHaveBeenCalledWith(tx, {
      actor,
      entry: created,
      predecessor: null,
      timezone: "Europe/London",
      now: expect.any(Date),
    });
    expect(tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: expect.objectContaining({
          demeritStage: 2,
          demeritAction: "notify",
          demeritPolicyVersion: 3,
          demeritIntentCount: 1,
        }),
      }),
    });
  });

  it("rejects inactive, mismatched type or visibility, and malformed serious category states", async () => {
    const cases = [
      {
        policy: { isActive: false },
        submitted: {},
      },
      {
        policy: { type: "DEMERIT" },
        submitted: {},
      },
      {
        policy: { visibility: "SENSITIVE" },
        submitted: {},
      },
      {
        policy: { type: "MERIT", isSerious: true },
        submitted: {},
      },
    ];

    for (const testCase of cases) {
      const { commandService, tx } = arrange();
      tx.behaviourCategory.findFirst.mockResolvedValue({
        policyVersion: 3,
        code: "service",
        type: "MERIT",
        visibility: "GENERAL",
        isActive: true,
        isSerious: false,
        ...testCase.policy,
      });

      await expect(
        commandService.record(command(testCase.submitted), actor),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.behaviourEntry.create).not.toHaveBeenCalled();
    }
  });

  it("requires the separate sensitive permission before selecting a sensitive category", async () => {
    const { commandService, tx, effectivePermissions } = arrange({
      sensitive: false,
    });
    tx.behaviourCategory.findFirst.mockResolvedValue({
      policyVersion: 3,
      code: "pastoral",
      type: "GENERAL",
      visibility: "SENSITIVE",
      isActive: true,
      isSerious: false,
    });

    await expect(
      commandService.record(
        command({
          category: "pastoral",
          type: "GENERAL",
          visibility: "SENSITIVE",
          pointsDelta: 0,
        }),
        actor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(effectivePermissions.resolve).toHaveBeenCalledWith({
      ...actor,
      permission: "ace.behaviour.sensitive.read",
      now: expect.any(Date),
    });
    expect(tx.behaviourEntry.create).not.toHaveBeenCalled();
  });

  it("returns an identical replay and rejects payload mismatch for a reused command key", async () => {
    const { commandService, tx, demeritEscalation } = arrange();
    tx.behaviourEntry.findFirst.mockResolvedValueOnce(
      entry({
        clientCommandKeyHash: behaviourClientCommandKeyHash(
          actor.tenantId,
          command().idempotencyKey,
        ),
        commandFingerprint: behaviourCommandFingerprint(
          "record",
          actor.userId,
          command(),
          null,
        ),
      }),
    );

    await expect(commandService.record(command(), actor)).resolves.toEqual({
      entry: expect.objectContaining({ id: "entry-1" }),
      duplicate: true,
    });
    expect(tx.behaviourEntry.create).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
    expect(tx.outboxEvent.createMany).not.toHaveBeenCalled();
    expect(demeritEscalation.createIntents).not.toHaveBeenCalled();

    tx.behaviourEntry.findFirst.mockResolvedValueOnce(
      entry({
        clientCommandKeyHash: "expected-client-hash",
        commandFingerprint: "different-fingerprint",
      }),
    );
    await expect(
      commandService.record(command({ pointsDelta: 4 }), actor),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects a sensitive replay after the separate permission is revoked", async () => {
    const { commandService, tx } = arrange({ sensitive: false });
    tx.behaviourEntry.findFirst.mockResolvedValueOnce(
      entry({
        visibility: "SENSITIVE",
        clientCommandKeyHash: behaviourClientCommandKeyHash(
          actor.tenantId,
          command().idempotencyKey,
        ),
        commandFingerprint: behaviourCommandFingerprint(
          "record",
          actor.userId,
          command(),
          null,
        ),
      }),
    );

    await expect(
      commandService.record(command(), actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.behaviourEntry.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.behaviourEntry.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: actor.tenantId,
        clientCommandKeyHash: behaviourClientCommandKeyHash(
          actor.tenantId,
          command().idempotencyKey,
        ),
      },
      select: {
        id: true,
        visibility: true,
        commandFingerprint: true,
      },
    });
    expect(tx.behaviourEntry.findFirstOrThrow).not.toHaveBeenCalled();
  });

  it("records a complete correction only for a terminal predecessor under the same child and tenant", async () => {
    const { commandService, tx } = arrange();
    tx.behaviourEntry.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        entry({ id: originalId, correction: null, recordedByUserId: "user-2" }),
      );
    tx.behaviourEntry.create.mockResolvedValue(
      entry({
        id: "correction-1",
        pointsDelta: 2,
        correctsBehaviourEntryId: originalId,
      }),
    );

    await expect(
      commandService.correct(originalId, correction(), actor),
    ).resolves.toEqual({
      entry: expect.objectContaining({
        id: "correction-1",
        correctsBehaviourEntryId: originalId,
      }),
      duplicate: false,
    });
    expect(tx.behaviourEntry.findFirst).toHaveBeenCalledWith({
      where: { id: originalId, tenantId: actor.tenantId, childId },
      select: {
        id: true,
        type: true,
        visibility: true,
        pointsDelta: true,
        occurredAt: true,
        categoryIsSerious: true,
        correction: { select: { id: true } },
      },
    });
    expect(tx.behaviourEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        correctsBehaviourEntryId: originalId,
        childId,
        pointsDelta: 2,
      }),
      select: expect.any(Object),
    });
  });

  it("requires sensitive permission when the correction predecessor is sensitive", async () => {
    const { commandService, tx } = arrange({ sensitive: false });
    tx.behaviourEntry.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: originalId,
        type: "MERIT",
        visibility: "SENSITIVE",
        pointsDelta: 3,
        correction: null,
      });

    await expect(
      commandService.correct(originalId, correction(), actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.behaviourEntry.create).not.toHaveBeenCalled();
  });

  it("emits one net Merit reversal intent when correcting Merit to General", async () => {
    const { commandService, tx } = arrange();
    tx.behaviourEntry.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: originalId,
        type: "MERIT",
        visibility: "GENERAL",
        pointsDelta: 3,
        correction: null,
      });
    tx.behaviourCategory.findFirst.mockResolvedValue({
      policyVersion: 3,
      code: "observation",
      type: "GENERAL",
      visibility: "GENERAL",
      isActive: true,
      isSerious: false,
    });
    tx.behaviourEntry.create.mockResolvedValue(
      entry({
        id: "correction-1",
        category: "observation",
        type: "GENERAL",
        pointsDelta: 0,
        correctsBehaviourEntryId: originalId,
      }),
    );

    await commandService.correct(
      originalId,
      correction({
        category: "observation",
        type: "GENERAL",
        pointsDelta: 0,
      }),
      actor,
    );

    expect(tx.outboxEvent.createMany).toHaveBeenCalledTimes(1);
    expect(tx.outboxEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          aggregateId: "correction-1",
          eventType: "behaviour.merit-awarded",
          payload: {
            behaviourEntryId: "correction-1",
            childId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            pointsDelta: -3,
            correctsBehaviourEntryId: originalId,
          },
        }),
      ],
      skipDuplicates: true,
    });
  });

  it("rejects missing child scope and an already superseded correction target", async () => {
    const { commandService, tx } = arrange();
    tx.child.findFirst.mockResolvedValue(null);
    await expect(
      commandService.record(command(), actor),
    ).rejects.toBeInstanceOf(NotFoundException);

    tx.child.findFirst.mockResolvedValue({ id: childId });
    tx.behaviourEntry.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        entry({ id: originalId, correction: { id: "next" } }),
      );
    await expect(
      commandService.correct(originalId, correction(), actor),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("does not emit a merit intent for General or Demerit entries", async () => {
    for (const value of [
      { type: "GENERAL" as const, pointsDelta: 0 },
      { type: "DEMERIT" as const, pointsDelta: -2 },
    ]) {
      const { commandService, tx } = arrange();
      tx.behaviourCategory.findFirst.mockResolvedValue({
        policyVersion: 3,
        code: "conduct",
        visibility: "GENERAL",
        isActive: true,
        isSerious: value.type === "DEMERIT",
        ...value,
      });
      tx.behaviourEntry.create.mockResolvedValue(
        entry({ category: "conduct", ...value }),
      );

      await commandService.record(
        command({ category: "conduct", ...value }),
        actor,
      );
      expect(tx.outboxEvent.createMany).not.toHaveBeenCalled();
    }
  });
});

describe("BehaviourQueryService", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns only terminal tenant facts through an explicit field allow-list", async () => {
    const { queryService, tx } = arrange({ sensitive: false });
    tx.behaviourEntry.findMany.mockResolvedValue([
      entry({ note: null, reason: "Non-sensitive reason" }),
    ]);

    await expect(
      queryService.list(actor, { childId, limit: 25 }),
    ).resolves.toEqual({
      items: [expect.objectContaining({ id: "entry-1" })],
    });
    expect(tx.behaviourEntry.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: actor.tenantId,
        childId,
        visibility: "GENERAL",
        correction: { is: null },
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: 25,
      select: expect.objectContaining({
        id: true,
        tenantId: false,
        clientCommandKeyHash: false,
        commandFingerprint: false,
      }),
    });
  });

  it("includes sensitive terminal facts only when the actor has the separate sensitive permission", async () => {
    const { queryService, tx, effectivePermissions } = arrange({
      sensitive: true,
    });

    await queryService.list(actor, {});

    expect(effectivePermissions.resolve).toHaveBeenCalledWith({
      ...actor,
      permission: "ace.behaviour.sensitive.read",
      now: expect.any(Date),
    });
    expect(tx.behaviourEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: actor.tenantId,
          correction: { is: null },
        },
      }),
    );
  });

  it("rejects an invalid active site before reading behaviour records", async () => {
    const { queryService, tx } = arrange();
    tx.tenant.findFirst.mockResolvedValue(null);

    await expect(queryService.list(actor, {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tx.behaviourEntry.findMany).not.toHaveBeenCalled();
  });
});
