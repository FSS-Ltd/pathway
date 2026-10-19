import type { Prisma } from "@pathway/db";
import { FinanceStripeReversalWebhookService } from "../finance-stripe-reversal-webhook.service";
import type { FinanceStripeReversalWebhookInput } from "../finance-stripe-reversal-webhook.contracts";
import type { FinanceStripeRefundProvider } from "../finance-stripe-refund.provider";

type RefundStatus =
  | "PENDING"
  | "REJECTED"
  | "APPROVED"
  | "SUBMITTED"
  | "CONFIRMED"
  | "FAILED"
  | "RETURNED";
type MovementType =
  | "REFUND"
  | "REFUND_RETURN"
  | "DISPUTE_WITHDRAWAL"
  | "DISPUTE_REINSTATEMENT";
type EventType = "SUBMITTED" | "CONFIRMED" | "FAILED" | "RETURNED";

interface MockRefundEvent {
  id: string;
  stripeEventId: string | null;
  sourceReference: string | null;
  providerOccurredAt: Date | null;
  type: EventType;
  createdAt: Date;
}

interface MockMovement {
  id: string;
  financeProfileId: string;
  receiptId: string;
  refundId: string | null;
  tenantId: string;
  orgId: string;
  type: MovementType;
  source: "MANUAL_TRANSFER" | "STRIPE";
  amountMinor: bigint;
  currency: string;
  sourceReference: string;
  stripeEventId: string | null;
  originalMovementId: string | null;
  occurredAt: Date;
}

interface MockApplication {
  id: string;
  movementId: string;
  invoiceId: string;
  receiptAllocationId: string;
  reversesApplicationId: string | null;
  amountMinor: bigint;
}

interface MockTransaction {
  $queryRaw: jest.Mock;
  financeCheckoutAttempt: { findFirst: jest.Mock };
  financeReceipt: { findFirst: jest.Mock };
  financeRefund: { findFirst: jest.Mock; updateMany: jest.Mock };
  financeRefundEvent: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
  };
  financeReceiptMovement: { findFirst: jest.Mock; create: jest.Mock };
  financeReceiptAllocation: { findMany: jest.Mock };
  financeReceiptMovementApplication: { findMany: jest.Mock; create: jest.Mock };
}

let mockTransaction: MockTransaction;

jest.mock("@pathway/db", () => ({
  withTenantRlsContext: jest.fn(
    async (
      _tenantId: string,
      _orgId: string,
      callback: (tx: unknown) => unknown,
    ) => callback(mockTransaction),
  ),
}));

const tenantId = "tenant-1";
const orgId = "org-1";
const stripeAccountId = "acct_school_1";
const refundId = "refund-1";
const refundReference = "re_school_1";
const receiptId = "receipt-1";
const occurredAt = new Date("2026-10-19T10:00:00.000Z");

function stripeRefundEvent(input: {
  eventId: string;
  type: "refund.updated" | "refund.failed";
  status: "succeeded" | "failed";
  occurredAt?: Date;
}) {
  return {
    id: input.eventId,
    type: input.type,
    created: Math.floor((input.occurredAt ?? occurredAt).getTime() / 1_000),
    livemode: false,
    account: stripeAccountId,
    data: {
      object: {
        id: refundReference,
        object: "refund",
        amount: 500,
        currency: "gbp",
        status: input.status,
        payment_intent: "pi_school_1",
        metadata: { finance_refund_id: refundId },
      },
    },
  };
}

function setup(): {
  service: FinanceStripeReversalWebhookService;
  refundEvents: MockRefundEvent[];
  movements: MockMovement[];
  applications: MockApplication[];
  refund: { id: string; status: RefundStatus; providerStatusAt: Date | null };
} {
  const refund = {
    id: refundId,
    status: "APPROVED" as RefundStatus,
    amountMinor: 500n,
    currency: "GBP",
    financeProfileId: "profile-1",
    receiptId,
    providerStatusAt: null as Date | null,
    stripeRefundId: null as string | null,
  };
  const refundEvents: MockRefundEvent[] = [];
  const movements: MockMovement[] = [];
  const applications: MockApplication[] = [];
  const provider: FinanceStripeRefundProvider = {
    retrieveChargePaymentIntent: jest.fn().mockResolvedValue(null),
    createRefund: jest.fn(),
  };

  mockTransaction = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: refundId }]),
    financeCheckoutAttempt: {
      findFirst: jest.fn().mockResolvedValue({
        financeProfileId: "profile-1",
        stripeCheckoutSessionId: "cs_school_1",
      }),
    },
    financeReceipt: {
      findFirst: jest.fn().mockResolvedValue({
        id: receiptId,
        financeProfileId: "profile-1",
        amountMinor: 1_000n,
        currency: "GBP",
        confirmedAt: occurredAt,
      }),
    },
    financeRefund: {
      findFirst: jest.fn().mockImplementation(async () => ({ ...refund })),
      updateMany: jest
        .fn()
        .mockImplementation(async (input: { data: Partial<typeof refund> }) => {
          Object.assign(refund, input.data);
          return { count: 1 };
        }),
    },
    financeRefundEvent: {
      findUnique: jest
        .fn()
        .mockImplementation(
          async (input: { where: { stripeEventId: string } }) =>
            refundEvents.find(
              (event) => event.stripeEventId === input.where.stripeEventId,
            ) ?? null,
        ),
      findFirst: jest.fn().mockImplementation(
        async (input: {
          where: {
            sourceReference: string;
            providerOccurredAt: Date;
            type: EventType;
          };
        }) =>
          refundEvents.find(
            (event) =>
              event.sourceReference === input.where.sourceReference &&
              event.providerOccurredAt?.getTime() ===
                input.where.providerOccurredAt.getTime() &&
              event.type === input.where.type,
          ) ?? null,
      ),
      findMany: jest.fn().mockImplementation(
        async (input: {
          where: {
            sourceReference?: string;
            type?: EventType;
            providerOccurredAt?: { gte?: Date; not?: null };
            stripeEventId?: { not?: null };
          };
        }) =>
          refundEvents
            .filter((event) =>
              input.where.sourceReference
                ? event.sourceReference === input.where.sourceReference
                : true,
            )
            .filter((event) =>
              input.where.type ? event.type === input.where.type : true,
            )
            .filter((event) =>
              input.where.providerOccurredAt?.gte
                ? event.providerOccurredAt !== null &&
                  event.providerOccurredAt >= input.where.providerOccurredAt.gte
                : true,
            )
            .filter((event) =>
              input.where.stripeEventId?.not === null
                ? event.stripeEventId !== null
                : true,
            )
            .filter((event) =>
              input.where.providerOccurredAt?.not === null
                ? event.providerOccurredAt !== null
                : true,
            )
            .sort(
              (left, right) =>
                (left.providerOccurredAt?.getTime() ?? 0) -
                  (right.providerOccurredAt?.getTime() ?? 0) ||
                left.createdAt.getTime() - right.createdAt.getTime(),
            ),
      ),
      create: jest
        .fn()
        .mockImplementation(
          async (input: {
            data: Omit<MockRefundEvent, "id" | "createdAt">;
          }) => {
            const event: MockRefundEvent = {
              ...input.data,
              id: `refund-event-${refundEvents.length + 1}`,
              createdAt: new Date(Date.now() + refundEvents.length),
            };
            refundEvents.push(event);
            return event;
          },
        ),
    },
    financeReceiptMovement: {
      findFirst: jest
        .fn()
        .mockImplementation(
          async (input: {
            where: Partial<MockMovement> & { occurredAt?: { lte?: Date } };
          }) => {
            const { occurredAt: movementCutoff, ...facts } = input.where;
            const movement = movements.find(
              (candidate) =>
                Object.entries(facts).every(
                  ([key, value]) =>
                    candidate[key as keyof MockMovement] === value,
                ) &&
                (!movementCutoff?.lte ||
                  candidate.occurredAt <= movementCutoff.lte!),
            );
            return movement
              ? {
                  ...movement,
                  applications: applications
                    .filter(
                      (application) => application.movementId === movement.id,
                    )
                    .map(({ amountMinor }) => ({ amountMinor })),
                }
              : null;
          },
        ),
      create: jest
        .fn()
        .mockImplementation(
          async (input: { data: Omit<MockMovement, "id"> }) => {
            const movement: MockMovement = {
              ...input.data,
              id: `movement-${movements.length + 1}`,
            };
            movements.push(movement);
            return { id: movement.id };
          },
        ),
    },
    financeReceiptAllocation: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: "allocation-1",
          invoiceId: "invoice-1",
          amountMinor: 1_000n,
          createdAt: occurredAt,
          reversals: [],
          movementApplications: [],
        },
      ]),
    },
    financeReceiptMovementApplication: {
      findMany: jest
        .fn()
        .mockImplementation(async (input: { where: { movementId: string } }) =>
          applications
            .filter(
              (application) =>
                application.movementId === input.where.movementId,
            )
            .map((application) => ({
              ...application,
              reversedByApplications: applications
                .filter(
                  (candidate) =>
                    candidate.reversesApplicationId === application.id,
                )
                .map(({ amountMinor }) => ({ amountMinor })),
            })),
        ),
      create: jest
        .fn()
        .mockImplementation(
          async (input: { data: Omit<MockApplication, "id"> }) => {
            const application: MockApplication = {
              ...input.data,
              id: `application-${applications.length + 1}`,
            };
            applications.push(application);
            return { id: application.id };
          },
        ),
    },
  };

  return {
    service: new FinanceStripeReversalWebhookService(provider),
    refundEvents,
    movements,
    applications,
    refund,
  };
}

function webhookInput(
  event: ReturnType<typeof stripeRefundEvent>,
): FinanceStripeReversalWebhookInput {
  return {
    stripeEventId: event.id,
    tenantId,
    orgId,
    stripeAccountId,
    eventType: event.type,
    livemode: false,
    payloadJson: event as unknown as Prisma.JsonValue,
  };
}

describe("FinanceStripeReversalWebhookService", () => {
  it("records a refund and its later same-second return as separate ledger movements", async () => {
    const { service, movements, applications, refund, refundEvents } = setup();
    const succeeded = stripeRefundEvent({
      eventId: "evt_refund_succeeded",
      type: "refund.updated",
      status: "succeeded",
    });
    const failed = stripeRefundEvent({
      eventId: "evt_refund_returned",
      type: "refund.failed",
      status: "failed",
    });

    await service.process(webhookInput(succeeded));
    await service.process(webhookInput(failed));

    expect(
      movements.map(({ type, amountMinor }) => ({ type, amountMinor })),
    ).toEqual([
      { type: "REFUND", amountMinor: 500n },
      { type: "REFUND_RETURN", amountMinor: 500n },
    ]);
    expect(applications).toHaveLength(2);
    expect(applications[1]).toMatchObject({
      reversesApplicationId: applications[0]?.id,
      amountMinor: 500n,
    });
    expect(refund.status).toBe("RETURNED");
    expect(refundEvents.map(({ type }) => type)).toContain("RETURNED");
  });

  it("reconciles out-of-order same-second provider events without losing the return", async () => {
    const { service, movements, refund } = setup();
    const failed = stripeRefundEvent({
      eventId: "evt_refund_failed_first",
      type: "refund.failed",
      status: "failed",
    });
    const succeeded = stripeRefundEvent({
      eventId: "evt_refund_succeeded_after",
      type: "refund.updated",
      status: "succeeded",
    });

    await service.process(webhookInput(failed));
    await service.process(webhookInput(succeeded));

    expect(movements.map(({ type }) => type)).toEqual([
      "REFUND",
      "REFUND_RETURN",
    ]);
    expect(refund.status).toBe("RETURNED");
  });

  it("keeps a reinstatement retryable until its withdrawal event is recorded", async () => {
    const { service, movements } = setup();
    const event = {
      id: "evt_dispute_reinstated",
      type: "charge.dispute.funds_reinstated",
      created: Math.floor(occurredAt.getTime() / 1_000),
      livemode: false,
      account: stripeAccountId,
      data: {
        object: {
          id: "du_school_1",
          object: "dispute",
          amount: 500,
          currency: "gbp",
          payment_intent: "pi_school_1",
        },
      },
    };
    const input = webhookInput(event as ReturnType<typeof stripeRefundEvent>);
    input.eventType = event.type;

    await expect(service.process(input)).rejects.toThrow(
      "Finance dispute reinstatement is waiting for withdrawal",
    );
    expect(movements).toHaveLength(0);
  });
});
