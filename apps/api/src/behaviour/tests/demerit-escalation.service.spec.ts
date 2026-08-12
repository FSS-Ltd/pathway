import "reflect-metadata";
import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import type { MailerService } from "../../mailer/mailer.service";
import { renderBehaviourNotification } from "../../mailer/templates/behaviour-notification";
import {
  DemeritEscalationService,
  type GuardianNotificationIntent,
} from "../demerit-escalation.service";
import { OutboxService } from "../../common/outbox/outbox.service";
import { BehaviourOutboxController } from "../behaviour-outbox.controller";

jest.mock("@pathway/db", () => ({
  withTenantRlsContext: jest.fn(),
}));

const actor = { tenantId: "tenant-1", orgId: "org-1", userId: "user-1" };
const now = new Date("2026-08-12T12:00:00.000Z");

function behaviourEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: "entry-1",
    childId: "child-1",
    type: "DEMERIT" as const,
    visibility: "GENERAL" as const,
    pointsDelta: -1,
    occurredAt: new Date("2026-08-12T09:30:00.000Z"),
    categoryIsSerious: false,
    reason: "Private staff rationale",
    note: "Sensitive incident narrative",
    ...overrides,
  };
}

function transaction(
  options: {
    priorEntries?: Array<{
      pointsDelta: number;
      occurredAt: Date;
      categoryIsSerious: boolean | null;
    }>;
    guardianUserIds?: string[];
    reviewerUserIds?: string[];
  } = {},
) {
  const events = new Map<string, Record<string, unknown>>();
  const tx = {
    demeritPolicy: {
      findFirst: jest.fn().mockResolvedValue({
        id: "policy-3",
        version: 3,
        windowDays: 30,
        stageOneThreshold: 3,
        stageTwoThreshold: 6,
        stageThreeThreshold: 10,
        seriousMisconductStage: 3,
      }),
    },
    behaviourEntry: {
      findMany: jest.fn().mockResolvedValue(options.priorEntries ?? []),
    },
    demeritStageOverride: { findFirst: jest.fn().mockResolvedValue(null) },
    guardianChildRelationship: {
      findMany: jest.fn().mockResolvedValue(
        (options.guardianUserIds ?? ["guardian-1"]).map((userId) => ({
          guardianIdentity: { userId },
        })),
      ),
    },
    userRoleAssignment: {
      findMany: jest.fn().mockResolvedValue(
        (options.reviewerUserIds ?? ["reviewer-1"]).map((userId) => ({
          userId,
        })),
      ),
    },
    outboxEvent: {
      createMany: jest
        .fn()
        .mockImplementation(
          ({ data }: { data: Array<Record<string, unknown>> }) => {
            let count = 0;
            for (const event of data) {
              const key = String(event.idempotencyKey);
              if (events.has(key)) continue;
              events.set(key, event);
              count += 1;
            }
            return { count };
          },
        ),
      findFirstOrThrow: jest
        .fn()
        .mockImplementation(
          ({ where }: { where: { idempotencyKey: string } }) =>
            events.get(where.idempotencyKey),
        ),
    },
  };
  return { tx, events };
}

function mailer() {
  return {
    sendBehaviourNotification: jest.fn().mockResolvedValue(undefined),
  };
}

function service(mailerMock = mailer()) {
  return {
    mailerMock,
    escalation: new DemeritEscalationService(
      new OutboxService(),
      mailerMock as unknown as MailerService,
    ),
  };
}

async function createIntents(options: {
  priorUnits: number;
  entry?: ReturnType<typeof behaviourEntry>;
  guardianUserIds?: string[];
  reviewerUserIds?: string[];
}) {
  const priorEntries = options.priorUnits
    ? [
        {
          pointsDelta: -options.priorUnits,
          occurredAt: new Date("2026-08-11T09:00:00.000Z"),
          categoryIsSerious: false,
        },
      ]
    : [];
  const { tx, events } = transaction({
    priorEntries,
    guardianUserIds: options.guardianUserIds,
    reviewerUserIds: options.reviewerUserIds,
  });
  const { escalation } = service();
  const result = await escalation.createIntents(tx as never, {
    actor,
    entry: options.entry ?? behaviourEntry(),
    predecessor: null,
    timezone: "Europe/London",
    now,
  });
  return { result, tx, events };
}

describe("DemeritEscalationService", () => {
  const originalInternalAuthSecret = process.env.INTERNAL_AUTH_SECRET;
  const originalBehaviourOutboxSecret = process.env.BEHAVIOUR_OUTBOX_SECRET;

  beforeEach(() => jest.clearAllMocks());
  afterEach(() => {
    process.env.INTERNAL_AUTH_SECRET = originalInternalAuthSecret;
    process.env.BEHAVIOUR_OUTBOX_SECRET = originalBehaviourOutboxSecret;
  });

  it.each([
    {
      priorUnits: 2,
      stage: 1,
      action: "review",
      eventType: "behaviour.review-requested",
      reviewKind: "SITE",
    },
    {
      priorUnits: 5,
      stage: 2,
      action: "notify",
      eventType: "behaviour.guardian-notification.requested",
      reviewKind: undefined,
    },
    {
      priorUnits: 9,
      stage: 3,
      action: "head-review",
      eventType: "behaviour.review-requested",
      reviewKind: "HEAD",
    },
  ])(
    "creates the $action intent only when the demerit total crosses stage $stage",
    async ({ priorUnits, stage, action, eventType, reviewKind }) => {
      const { result, events } = await createIntents({ priorUnits });

      expect(result).toEqual({
        stage,
        action,
        policyVersion: 3,
        createdIntentCount: 1,
      });
      expect([...events.values()]).toEqual([
        expect.objectContaining({
          aggregateType: "BEHAVIOUR_ENTRY",
          aggregateId: "entry-1",
          eventType,
          payload: expect.objectContaining({
            behaviourEntryId: "entry-1",
            childId: "child-1",
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            stage,
            demeritPolicyVersion: 3,
            occurredOn: "2026-08-12",
            ...(reviewKind ? { reviewKind } : {}),
          }),
        }),
      ]);
    },
  );

  it("does not repeat an escalation while the child remains inside the same stage", async () => {
    const { result, events } = await createIntents({ priorUnits: 3 });

    expect(result).toEqual({
      stage: 1,
      action: "review",
      policyVersion: 3,
      createdIntentCount: 0,
    });
    expect(events).toHaveProperty("size", 0);
  });

  it("routes serious misconduct to organisation heads and requires a note", async () => {
    const serious = behaviourEntry({
      categoryIsSerious: true,
      note: "Required restricted context",
    });
    const { result, tx, events } = await createIntents({
      priorUnits: 0,
      entry: serious,
      reviewerUserIds: ["head-1"],
    });

    expect(result).toEqual({
      stage: 3,
      action: "head-review",
      policyVersion: 3,
      createdIntentCount: 1,
    });
    expect(tx.userRoleAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          orgId: actor.orgId,
          tenantId: null,
          roleDefinition: expect.objectContaining({
            name: "Organisation Head",
          }),
        }),
      }),
    );
    expect([...events.values()][0]).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          reviewKind: "HEAD",
          recipientUserIds: ["head-1"],
        }),
      }),
    );

    await expect(
      createIntents({
        priorUnits: 0,
        entry: behaviourEntry({ categoryIsSerious: true, note: null }),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("notifies guardians when a correction changes head review to notification", async () => {
    const { tx, events } = transaction();
    const { escalation } = service();

    const result = await escalation.createIntents(tx as never, {
      actor,
      entry: behaviourEntry({
        id: "correction-1",
        pointsDelta: -6,
        categoryIsSerious: false,
      }),
      predecessor: {
        id: "entry-1",
        type: "DEMERIT",
        pointsDelta: -10,
        occurredAt: new Date("2026-08-12T09:30:00.000Z"),
        categoryIsSerious: true,
      },
      timezone: "Europe/London",
      now,
    });

    expect(result).toEqual({
      stage: 2,
      action: "notify",
      policyVersion: 3,
      createdIntentCount: 1,
    });
    expect([...events.values()]).toEqual([
      expect.objectContaining({
        aggregateId: "correction-1",
        eventType: "behaviour.guardian-notification.requested",
      }),
    ]);
  });

  it("does not repeat head review when a correction remains serious", async () => {
    const { tx, events } = transaction();
    const { escalation } = service();

    const result = await escalation.createIntents(tx as never, {
      actor,
      entry: behaviourEntry({
        id: "correction-1",
        pointsDelta: -2,
        categoryIsSerious: true,
      }),
      predecessor: {
        id: "entry-1",
        type: "DEMERIT",
        pointsDelta: -1,
        occurredAt: new Date("2026-08-12T09:30:00.000Z"),
        categoryIsSerious: true,
      },
      timezone: "Europe/London",
      now,
    });

    expect(result).toEqual({
      stage: 3,
      action: "head-review",
      policyVersion: 3,
      createdIntentCount: 0,
    });
    expect(events).toHaveProperty("size", 0);
  });

  it("uses the site timezone for the cumulative window and applies an active authorised override", async () => {
    const { tx } = transaction({ priorEntries: [] });
    tx.demeritStageOverride.findFirst.mockResolvedValue({ stage: 2 });
    const { escalation } = service();

    const result = await escalation.createIntents(tx as never, {
      actor,
      entry: behaviourEntry({ pointsDelta: -1 }),
      predecessor: null,
      timezone: "Europe/London",
      now,
    });

    expect(tx.behaviourEntry.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: actor.tenantId,
        childId: "child-1",
        type: "DEMERIT",
        correction: { is: null },
        id: { not: "entry-1" },
        occurredAt: {
          gte: new Date("2026-07-13T23:00:00.000Z"),
          lt: new Date("2026-08-12T23:00:00.000Z"),
        },
      },
      select: {
        pointsDelta: true,
        occurredAt: true,
        categoryIsSerious: true,
      },
    });
    expect(tx.demeritStageOverride.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: actor.tenantId,
        childId: "child-1",
        demeritPolicyId: "policy-3",
        expiresAt: { gt: now },
      },
      orderBy: [{ stage: "desc" }, { createdAt: "desc" }],
      select: { stage: true },
    });
    expect(result).toEqual(
      expect.objectContaining({ stage: 2, action: "notify" }),
    );
  });

  it("does not create a guardian notification intent when no active guardian exists", async () => {
    const { result, events } = await createIntents({
      priorUnits: 5,
      guardianUserIds: [],
    });

    expect(result).toEqual({
      stage: 2,
      action: "notify",
      policyVersion: 3,
      createdIntentCount: 0,
    });
    expect(events).toHaveProperty("size", 0);
  });

  it("keeps command retries idempotent and excludes sensitive narrative from every intent and email", async () => {
    const { tx, events } = transaction({
      priorEntries: [
        {
          pointsDelta: -5,
          occurredAt: new Date("2026-08-11T09:00:00.000Z"),
          categoryIsSerious: false,
        },
      ],
    });
    const { escalation } = service();
    const sensitiveEntry = behaviourEntry({ visibility: "SENSITIVE" });
    const input = {
      actor,
      entry: sensitiveEntry,
      predecessor: null,
      timezone: "Europe/London",
      now,
    } as const;

    await escalation.createIntents(tx as never, input);
    await escalation.createIntents(tx as never, input);

    expect(events).toHaveProperty("size", 1);
    const serializedIntent = JSON.stringify([...events.values()][0]);
    expect(serializedIntent).not.toContain(sensitiveEntry.note);
    expect(serializedIntent).not.toContain(sensitiveEntry.reason);

    const rendered = renderBehaviourNotification({
      guardianName: "Guardian <One>",
      childName: "Learner One",
      siteName: "ACE Site",
      stage: 2,
      occurredOn: "2026-08-12",
    });
    expect(`${rendered.subject}${rendered.html}${rendered.text}`).not.toContain(
      sensitiveEntry.note,
    );
    expect(`${rendered.subject}${rendered.html}${rendered.text}`).not.toContain(
      sensitiveEntry.reason,
    );
    expect(rendered.html).toContain("Guardian &lt;One&gt;");
  });

  it("surfaces delivery failure for the outbox to retry with the same provider idempotency key", async () => {
    const mailerMock = mailer();
    mailerMock.sendBehaviourNotification
      .mockRejectedValueOnce(new Error("Resend unavailable"))
      .mockResolvedValueOnce(undefined);
    const { escalation } = service(mailerMock);
    const deliveryTx = {
      tenant: {
        findFirst: jest.fn().mockResolvedValue({ name: "ACE Site" }),
      },
      child: {
        findFirst: jest.fn().mockResolvedValue({
          firstName: "Learner",
          lastName: "One",
          preferredName: "Learner",
        }),
      },
      guardianChildRelationship: {
        findMany: jest.fn().mockResolvedValue([
          {
            guardianIdentity: {
              user: {
                id: "guardian-1",
                email: "guardian@example.com",
                name: "Guardian One",
                displayName: null,
                firstName: null,
              },
            },
          },
        ]),
      },
    };
    jest
      .mocked(withTenantRlsContext)
      .mockImplementation(async (_tenantId, _orgId, callback) =>
        callback(deliveryTx as never),
      );
    const intent: GuardianNotificationIntent = {
      aggregateType: "BEHAVIOUR_ENTRY",
      aggregateId: "entry-1",
      eventType: "behaviour.guardian-notification.requested",
      idempotencyKey: "behaviour-guardian-notification:entry-1:2",
      payload: {
        behaviourEntryId: "entry-1",
        childId: "child-1",
        tenantId: actor.tenantId,
        orgId: actor.orgId,
        stage: 2,
        demeritPolicyVersion: 3,
        occurredOn: "2026-08-12",
        recipientUserIds: ["guardian-1"],
      },
    };

    await expect(
      escalation.deliverGuardianNotification(intent),
    ).rejects.toThrow("Resend unavailable");
    await expect(
      escalation.deliverGuardianNotification(intent),
    ).resolves.toEqual({ sent: 1 });

    expect(mailerMock.sendBehaviourNotification).toHaveBeenCalledTimes(2);
    expect(mailerMock.sendBehaviourNotification).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        to: "guardian@example.com",
        guardianName: "Guardian One",
        childName: "Learner",
        siteName: "ACE Site",
        idempotencyKey: "behaviour-guardian-notification:entry-1:2:guardian-1",
      }),
    );
    expect(mailerMock.sendBehaviourNotification).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        idempotencyKey: "behaviour-guardian-notification:entry-1:2:guardian-1",
      }),
    );
  });

  it("exposes guardian delivery only through the authenticated internal outbox route", async () => {
    process.env.INTERNAL_AUTH_SECRET = "internal-secret";
    process.env.BEHAVIOUR_OUTBOX_SECRET = "behaviour-secret";
    const { escalation } = service();
    jest.spyOn(escalation, "dispatch").mockResolvedValue({ sent: 1 });
    const controller = new BehaviourOutboxController(escalation);
    const intent = { eventType: "behaviour.guardian-notification.requested" };

    expect(() => controller.dispatch(intent, "wrong-secret")).toThrow(
      UnauthorizedException,
    );
    await expect(
      controller.dispatch(intent, "behaviour-secret"),
    ).resolves.toEqual({ sent: 1 });
    expect(() => controller.dispatch(intent, "internal-secret")).toThrow(
      UnauthorizedException,
    );
    expect(escalation.dispatch).toHaveBeenCalledWith(intent);
  });
});
