import { Inject, Injectable } from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import { z } from "zod";
import type { FinanceCurrency } from "@pathway/platform";
import { FinanceBalanceService } from "../finance-balance.service";
import { lockInvoice } from "../finance-invoice-operations";

const checkoutEventTypes = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
] as const;

const checkoutSessionEventSchema = z.object({
  id: z.string().min(1),
  type: z.enum(checkoutEventTypes),
  created: z.number().int().positive(),
  livemode: z.boolean(),
  account: z.string().startsWith("acct_"),
  data: z.object({
    object: z
      .object({
        id: z.string().startsWith("cs_"),
        object: z.literal("checkout.session"),
        client_reference_id: z.string().min(1),
        amount_total: z.number().int().nonnegative(),
        currency: z.string().length(3),
        payment_status: z.enum(["paid", "unpaid", "no_payment_required"]),
        status: z.enum(["open", "complete", "expired"]),
        metadata: z
          .object({
            finance_checkout_attempt_id: z.string().min(1),
            finance_invoice_id: z.string().min(1),
          })
          .passthrough(),
      })
      .passthrough(),
  }),
});

type FinanceStripePaymentWebhookInput = {
  stripeEventId: string;
  tenantId: string;
  orgId: string;
  stripeAccountId: string | null;
  eventType: string;
  livemode: boolean;
  payloadJson: Prisma.JsonValue;
};

type CheckoutSessionEvent = z.infer<typeof checkoutSessionEventSchema>;

@Injectable()
export class FinanceStripePaymentWebhookService {
  constructor(
    @Inject(FinanceBalanceService)
    private readonly balances: FinanceBalanceService,
  ) {}

  async process(
    input: FinanceStripePaymentWebhookInput,
  ): Promise<"processed" | "deferred"> {
    if (!isCheckoutEventType(input.eventType)) return "deferred";
    const event = parseCheckoutEvent(input);
    const stripeAccountId = input.stripeAccountId;
    if (!stripeAccountId || event.account !== stripeAccountId) {
      throw new Error(
        "Finance Checkout event account does not match its inbox scope",
      );
    }

    return withTenantRlsContext<"processed" | "deferred">(
      input.tenantId,
      input.orgId,
      async (tx) => {
        const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "FinanceCheckoutAttempt"
        WHERE "stripeAccountId" = ${stripeAccountId}
          AND "stripeCheckoutSessionId" = ${event.data.object.id}
          AND "tenantId" = ${input.tenantId}
          AND "orgId" = ${input.orgId}
        FOR UPDATE
      `;
        if (locked.length !== 1) {
          throw new Error("Finance Checkout event does not match an attempt");
        }

        const attempt = await tx.financeCheckoutAttempt.findFirst({
          where: {
            stripeAccountId,
            stripeCheckoutSessionId: event.data.object.id,
            tenantId: input.tenantId,
            orgId: input.orgId,
          },
        });
        if (!attempt) {
          throw new Error("Finance Checkout attempt disappeared during replay");
        }

        await lockInvoice(tx, input, attempt.invoiceId);
        const [invoice, stripeConnection] = await Promise.all([
          tx.financeInvoice.findFirst({
            where: {
              id: attempt.invoiceId,
              tenantId: input.tenantId,
              orgId: input.orgId,
            },
            select: {
              id: true,
              financeProfileId: true,
              payerAccountId: true,
              status: true,
              currency: true,
              totalMinor: true,
            },
          }),
          tx.financeStripeConnection.findFirst({
            where: {
              id: attempt.stripeConnectionId,
              tenantId: input.tenantId,
              orgId: input.orgId,
            },
            select: { stripeAccountId: true, livemode: true },
          }),
        ]);
        if (!invoice || !stripeConnection) {
          throw new Error(
            "Finance Checkout attempt has missing linked records",
          );
        }
        const attemptWithRelations = { ...attempt, invoice, stripeConnection };
        const scopedInput = { ...input, stripeAccountId };

        assertAttemptMatchesEvent(attemptWithRelations, event, scopedInput);
        if (event.type === "checkout.session.completed") {
          if (event.data.object.status !== "complete") {
            throw new Error(
              "Completed Checkout event has an invalid session status",
            );
          }
          if (event.data.object.payment_status === "paid") {
            await this.recordConfirmedReceipt(
              tx,
              input,
              attemptWithRelations,
              event.data.object.id,
              new Date(event.created * 1_000),
            );
            return "processed";
          }
          if (event.data.object.payment_status !== "unpaid") {
            throw new Error("Finance Checkout did not collect a payment");
          }
          await tx.financeCheckoutAttempt.updateMany({
            where: {
              id: attempt.id,
              tenantId: input.tenantId,
              orgId: input.orgId,
              status: { in: ["CREATING", "OPEN"] },
            },
            data: { status: "COMPLETED" },
          });
          return "processed";
        }

        if (event.type === "checkout.session.async_payment_succeeded") {
          if (
            event.data.object.status !== "complete" ||
            event.data.object.payment_status !== "paid"
          ) {
            throw new Error(
              "Successful Checkout event is not provider-confirmed",
            );
          }
          await this.recordConfirmedReceipt(
            tx,
            input,
            attemptWithRelations,
            event.data.object.id,
            new Date(event.created * 1_000),
          );
          return "processed";
        }

        if (event.type === "checkout.session.async_payment_failed") {
          if (
            event.data.object.status !== "complete" ||
            event.data.object.payment_status !== "unpaid"
          ) {
            throw new Error(
              "Failed Checkout event has an invalid payment status",
            );
          }
          await tx.financeCheckoutAttempt.updateMany({
            where: {
              id: attempt.id,
              tenantId: input.tenantId,
              orgId: input.orgId,
              status: { in: ["CREATING", "OPEN", "COMPLETED"] },
            },
            data: { status: "FAILED" },
          });
          return "processed";
        }

        if (
          event.data.object.status !== "expired" ||
          event.data.object.payment_status !== "unpaid"
        ) {
          throw new Error(
            "Expired Checkout event has an invalid payment status",
          );
        }
        await tx.financeCheckoutAttempt.updateMany({
          where: {
            id: attempt.id,
            tenantId: input.tenantId,
            orgId: input.orgId,
            status: { in: ["CREATING", "OPEN", "COMPLETED"] },
          },
          data: { status: "EXPIRED" },
        });
        return "processed";
      },
    );
  }

  private async recordConfirmedReceipt(
    tx: Prisma.TransactionClient,
    input: FinanceStripePaymentWebhookInput,
    attempt: {
      id: string;
      financeProfileId: string;
      invoiceId: string;
      amountMinor: bigint;
      currency: FinanceCurrency;
      invoice: {
        id: string;
        financeProfileId: string;
        payerAccountId: string | null;
        status: "DRAFT" | "IN_REVIEW" | "ISSUED" | "VOID";
        currency: FinanceCurrency;
        totalMinor: bigint;
      };
    },
    sessionId: string,
    confirmedAt: Date,
  ): Promise<void> {
    if (!attempt.invoice.payerAccountId) {
      throw new Error("Finance Checkout invoice has no payer account");
    }
    const existing = await tx.financeReceipt.findFirst({
      where: {
        financeProfileId: attempt.financeProfileId,
        tenantId: input.tenantId,
        orgId: input.orgId,
        source: "STRIPE_CARD",
        sourceReference: sessionId,
      },
      select: {
        id: true,
        tenantId: true,
        orgId: true,
        payerAccountId: true,
        amountMinor: true,
        currency: true,
        status: true,
        confirmedAt: true,
      },
    });

    if (existing) {
      if (
        existing.tenantId !== input.tenantId ||
        existing.orgId !== input.orgId ||
        existing.payerAccountId !== attempt.invoice.payerAccountId ||
        existing.amountMinor !== attempt.amountMinor ||
        existing.currency !== attempt.currency ||
        existing.status !== "CONFIRMED" ||
        !existing.confirmedAt
      ) {
        throw new Error(
          "Existing Finance Checkout receipt does not match the payment",
        );
      }
    } else {
      const receipt = await tx.financeReceipt.create({
        data: {
          financeProfileId: attempt.financeProfileId,
          payerAccountId: attempt.invoice.payerAccountId,
          tenantId: input.tenantId,
          orgId: input.orgId,
          amountMinor: attempt.amountMinor,
          currency: attempt.currency,
          source: "STRIPE_CARD",
          sourceReference: sessionId,
          status: "CONFIRMED",
          confirmedAt,
        },
        select: { id: true },
      });

      if (attempt.invoice.status === "ISSUED") {
        const balances = await this.balances.forInvoices(tx, input, [
          attempt.invoice,
        ]);
        const outstandingMinor = BigInt(
          balances.get(attempt.invoiceId)?.outstandingMinor ?? "0",
        );
        const allocationMinor =
          outstandingMinor < attempt.amountMinor
            ? outstandingMinor
            : attempt.amountMinor;
        if (allocationMinor > 0n) {
          await tx.financeReceiptAllocation.create({
            data: {
              receiptId: receipt.id,
              invoiceId: attempt.invoiceId,
              tenantId: input.tenantId,
              orgId: input.orgId,
              amountMinor: allocationMinor,
              createdByUserId: null,
            },
            select: { id: true },
          });
        }
      }
    }

    await tx.financeCheckoutAttempt.updateMany({
      where: {
        id: attempt.id,
        tenantId: input.tenantId,
        orgId: input.orgId,
        status: { not: "PAID" },
      },
      data: { status: "PAID" },
    });
  }
}

function isCheckoutEventType(
  eventType: string,
): eventType is (typeof checkoutEventTypes)[number] {
  return checkoutEventTypes.some((supported) => supported === eventType);
}

function parseCheckoutEvent(
  input: FinanceStripePaymentWebhookInput,
): CheckoutSessionEvent {
  const parsed = checkoutSessionEventSchema.safeParse(input.payloadJson);
  if (
    !parsed.success ||
    parsed.data.id !== input.stripeEventId ||
    parsed.data.type !== input.eventType ||
    parsed.data.livemode !== input.livemode
  ) {
    throw new Error("Finance Checkout event payload is invalid");
  }
  return parsed.data;
}

function assertAttemptMatchesEvent(
  attempt: {
    id: string;
    invoiceId: string;
    amountMinor: bigint;
    currency: FinanceCurrency;
    livemode: boolean;
    stripeAccountId: string;
    financeProfileId: string;
    invoice: {
      id: string;
      financeProfileId: string;
      currency: FinanceCurrency;
    };
    stripeConnection: { stripeAccountId: string | null; livemode: boolean };
  },
  event: CheckoutSessionEvent,
  input: FinanceStripePaymentWebhookInput,
): void {
  const session = event.data.object;
  if (
    session.client_reference_id !== attempt.id ||
    session.metadata.finance_checkout_attempt_id !== attempt.id ||
    session.metadata.finance_invoice_id !== attempt.invoiceId ||
    attempt.invoice.id !== attempt.invoiceId ||
    attempt.invoice.financeProfileId !== attempt.financeProfileId ||
    attempt.invoice.currency !== attempt.currency ||
    !Number.isSafeInteger(session.amount_total) ||
    BigInt(session.amount_total) !== attempt.amountMinor ||
    session.currency.toUpperCase() !== attempt.currency ||
    attempt.stripeAccountId !== input.stripeAccountId ||
    attempt.stripeConnection.stripeAccountId !== input.stripeAccountId ||
    attempt.livemode !== input.livemode ||
    attempt.stripeConnection.livemode !== input.livemode
  ) {
    throw new Error("Finance Checkout event does not match its attempt facts");
  }
}
