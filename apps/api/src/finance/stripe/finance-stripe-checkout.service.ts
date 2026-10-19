import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { FinanceAccessService } from "../access/finance-access.service";
import { FinanceStripeCheckoutAttemptService } from "./finance-stripe-checkout-attempt.service";
import {
  FINANCE_STRIPE_CHECKOUT_CONFIG,
  type FinanceStripeCheckoutConfig,
} from "./finance-stripe-checkout.config";
import {
  financeCheckoutSessionExpiresAt,
  FinanceStripeCheckoutProviderError,
  FINANCE_STRIPE_CHECKOUT_PROVIDER,
  type FinanceStripeCheckoutProvider,
  type FinanceStripeCheckoutSession,
} from "./finance-stripe-checkout.provider";
import type {
  FinanceStripeCheckoutActor,
  FinanceStripeCheckoutAttemptRecord,
  FinanceStripeCheckoutView,
} from "./finance-stripe-checkout.types";

@Injectable()
export class FinanceStripeCheckoutService {
  constructor(
    @Inject(FinanceAccessService)
    private readonly financeAccess: FinanceAccessService,
    @Inject(FinanceStripeCheckoutAttemptService)
    private readonly attempts: FinanceStripeCheckoutAttemptService,
    @Inject(FINANCE_STRIPE_CHECKOUT_CONFIG)
    private readonly config: FinanceStripeCheckoutConfig,
    @Inject(FINANCE_STRIPE_CHECKOUT_PROVIDER)
    private readonly provider: FinanceStripeCheckoutProvider,
  ) {}

  async startCheckout(
    actor: FinanceStripeCheckoutActor,
    payerAccountId: string,
    invoiceId: string,
  ): Promise<FinanceStripeCheckoutView> {
    await this.financeAccess.assertPayerAction(
      actor,
      actor.userId,
      payerAccountId,
      "SETTLE_ISSUED_INVOICE",
    );
    if (this.config.mode === "disabled") {
      throw new ServiceUnavailableException(
        "Finance card payments are not configured",
      );
    }

    for (let recovery = 0; recovery < 2; recovery += 1) {
      const prepared = await this.attempts.prepare(
        actor,
        payerAccountId,
        invoiceId,
      );
      if (prepared.kind === "view") {
        await this.financeAccess.assertPayerAction(
          actor,
          actor.userId,
          payerAccountId,
          "SETTLE_ISSUED_INVOICE",
        );
        return prepared.view;
      }
      if (prepared.kind === "retrieve") {
        const recovered = await this.recoverExpiredSession(
          actor,
          prepared.attempt,
        );
        if (recovered) continue;
        return checkingView(prepared.attempt.id);
      }
      return this.createOrRecoverSession(actor, prepared.attempt);
    }

    throw new ConflictException("Checkout status changed; please try again");
  }

  private async createOrRecoverSession(
    actor: FinanceStripeCheckoutActor,
    attempt: FinanceStripeCheckoutAttemptRecord,
  ): Promise<FinanceStripeCheckoutView> {
    if (this.config.mode === "disabled") {
      throw new ServiceUnavailableException(
        "Finance card payments are not configured",
      );
    }
    await this.financeAccess.assertPayerAction(
      actor,
      actor.userId,
      await this.attempts.payerAccountIdForAttempt(actor, attempt.id),
      "SETTLE_ISSUED_INVOICE",
    );

    let session: FinanceStripeCheckoutSession;
    try {
      session = await this.provider.createSession({
        stripeAccountId: attempt.stripeAccountId,
        attemptId: attempt.id,
        invoiceId: attempt.invoiceId,
        invoiceNumber: attempt.invoiceNumber.toString(),
        amountMinor: attempt.amountMinor,
        currency: attempt.currency,
        idempotencyKey: attempt.idempotencyKey,
        integrationIdentifier: attempt.integrationIdentifier,
        expiresAt: financeCheckoutSessionExpiresAt(attempt.createdAt),
      });
    } catch (error) {
      if (
        error instanceof FinanceStripeCheckoutProviderError &&
        !error.retryable
      ) {
        await this.attempts.markFailed(actor, attempt.id);
      }
      throw new ServiceUnavailableException(
        "A card payment session could not be started. Please try again.",
      );
    }

    try {
      await this.attempts.persistSession(actor, attempt.id, session);
      await this.financeAccess.assertPayerAction(
        actor,
        actor.userId,
        await this.attempts.payerAccountIdForAttempt(actor, attempt.id),
        "SETTLE_ISSUED_INVOICE",
      );
    } catch (error) {
      if (error instanceof ForbiddenException) {
        try {
          await this.provider.expireSession({
            stripeAccountId: attempt.stripeAccountId,
            sessionId: session.id,
            idempotencyKey: `finance-checkout-expire-${attempt.id}`,
          });
          await this.attempts.markExpired(actor, attempt.id);
        } catch {
          // The link is not returned; the session remains bounded by Stripe expiry.
        }
      }
      throw error;
    }

    return this.attempts.readView(actor, attempt.id);
  }

  private async recoverExpiredSession(
    actor: FinanceStripeCheckoutActor,
    attempt: FinanceStripeCheckoutAttemptRecord,
  ): Promise<boolean> {
    if (!attempt.stripeCheckoutSessionId) {
      throw new ServiceUnavailableException(
        "Checkout status is still being confirmed. Please try again shortly.",
      );
    }
    let providerState: Awaited<
      ReturnType<FinanceStripeCheckoutProvider["retrieveSession"]>
    >;
    try {
      providerState = await this.provider.retrieveSession({
        stripeAccountId: attempt.stripeAccountId,
        sessionId: attempt.stripeCheckoutSessionId,
      });
    } catch {
      throw new ServiceUnavailableException(
        "Checkout status is still being confirmed. Please try again shortly.",
      );
    }
    if (providerState.status === "complete") {
      await this.attempts.markCompleted(actor, attempt.id);
      return false;
    }
    if (providerState.status === "open") {
      try {
        await this.provider.expireSession({
          stripeAccountId: attempt.stripeAccountId,
          sessionId: attempt.stripeCheckoutSessionId,
          idempotencyKey: `finance-checkout-expire-${attempt.id}`,
        });
      } catch {
        let latest: typeof providerState;
        try {
          latest = await this.provider.retrieveSession({
            stripeAccountId: attempt.stripeAccountId,
            sessionId: attempt.stripeCheckoutSessionId,
          });
        } catch {
          throw new ServiceUnavailableException(
            "Checkout status is still being confirmed. Please try again shortly.",
          );
        }
        if (latest.status === "complete") {
          await this.attempts.markCompleted(actor, attempt.id);
          return false;
        }
        if (latest.status !== "expired") {
          throw new ServiceUnavailableException(
            "Checkout status is still being confirmed. Please try again shortly.",
          );
        }
      }
    }
    await this.attempts.markExpired(actor, attempt.id);
    return true;
  }
}

function checkingView(attemptId: string): FinanceStripeCheckoutView {
  return {
    attemptId,
    status: "CHECKING",
    checkoutUrl: null,
    expiresAt: null,
  };
}
