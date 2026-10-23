import type {
  FinanceStripeMandateServicingProvider,
  FinanceMandateServicingObject,
} from "../stripe/finance-stripe-mandate-servicing.contracts";
import { parseFinanceMandateServicingObject } from "../stripe/finance-stripe-mandate-servicing.contracts";
import { FinanceStripeReconciliationError } from "../stripe/finance-stripe-reconciliation.provider";
import type {
  StripeFinanceReconciliationProvider,
  FinanceReconciliationObject,
  FinanceReconciliationStream,
} from "../stripe/finance-stripe-reconciliation.provider";
import type { FinanceConnectionScope } from "./finance-reconciliation.types";
import type { FinanceUnresolvedContext } from "./finance-unresolved-context.persistence";
import {
  planFinanceUnresolvedSearch,
  matchesFinanceUnresolvedMetadata,
  type FinanceUnresolvedSearch,
} from "./finance-unresolved-search";
import { prepareFinanceReconciliationObjects } from "./finance-reconciliation-prepare";

export interface FinancePreparedUnresolved {
  context: FinanceUnresolvedContext;
  objects: FinanceReconciliationObject[];
  mandateObjects: FinanceMandateServicingObject[];
  search: FinanceUnresolvedSearch | null;
  cancellationAcknowledged: boolean;
  issue?: string;
}
export interface FinanceUnresolvedProviders {
  provider: Pick<StripeFinanceReconciliationProvider, "retrieve" | "listPage">;
  mandates: FinanceStripeMandateServicingProvider;
}
const streams = {
  checkout: "checkoutSessions",
  debit: "paymentIntents",
  refund: "refunds",
  dispute: "disputes",
} as const;

/** All provider I/O finishes outside the page capture transaction. */
export async function prepareFinanceUnresolvedOperation(
  scope: FinanceConnectionScope,
  context: FinanceUnresolvedContext,
  now: Date,
  mode: "sync" | "dry-run",
  providers: FinanceUnresolvedProviders,
): Promise<FinancePreparedUnresolved> {
  const { operation, mandate } = context;
  const { provider, mandates } = providers;
  const result: FinancePreparedUnresolved = {
    context,
    objects: [],
    mandateObjects: [],
    search: null,
    cancellationAcknowledged: false,
  };
  async function finish(): Promise<FinancePreparedUnresolved> {
    if (!mandate) return result;
    // A late successful setup must reach canonical cleanup before an obsolete
    // Checkout expiry can be acknowledged. A newly linked method is a new target.
    if (
      !mandate.stripePaymentMethodId &&
      result.mandateObjects.some(
        (object) =>
          object.object === "setup_intent" && object.status === "succeeded",
      )
    )
      return result;
    if (
      mandate.status === "CANCELLED" &&
      mandate.providerCancellationPending &&
      mode === "sync"
    ) {
      const base = {
        ...scope,
        customerId: mandate.stripeCustomer.stripeCustomerId,
      };
      if (mandate.stripePaymentMethodId) {
        await mandates.detachPaymentMethod({
          ...base,
          paymentMethodId: mandate.stripePaymentMethodId,
          idempotencyKey: `finance-bacs-cancel-${mandate.id}`,
        });
        result.cancellationAcknowledged = true;
      } else if (mandate.stripeCheckoutSessionId) {
        await mandates.expireMandateSetupSession({
          ...base,
          sessionId: mandate.stripeCheckoutSessionId,
          mandateId: mandate.id,
          idempotencyKey: `finance-bacs-expire-${mandate.id}`,
        });
        result.cancellationAcknowledged = true;
      }
    }
    return result;
  }
  if (operation.kind === "mandate" && mandate) {
    if (mandate.stripeSetupIntentId)
      result.mandateObjects.push(
        await mandates.retrieve(
          scope,
          "setupIntents",
          mandate.stripeSetupIntentId,
        ),
      );
    if (mandate.stripeMandateId)
      result.mandateObjects.push(
        await mandates.retrieve(scope, "mandates", mandate.stripeMandateId),
      );
    if (mandate.stripePaymentMethodId)
      result.mandateObjects.push(
        await mandates.retrieve(
          scope,
          "paymentMethods",
          mandate.stripePaymentMethodId,
        ),
      );
    if (mandate.stripeSetupIntentId) return finish();
  } else if (operation.resourceId && operation.kind !== "mandate") {
    const stream: FinanceReconciliationStream = streams[operation.kind];
    result.objects = await prepareFinanceReconciliationObjects(
      scope,
      stream,
      [await provider.retrieve(scope, stream, operation.resourceId)],
      provider,
    );
    return result;
  }
  if (!context.attemptedAt || operation.kind === "dispute") return finish();
  const search = planFinanceUnresolvedSearch(
    operation,
    context.attemptedAt,
    context.search,
    now,
  );
  result.search = search;
  if (search.exhausted) return finish();
  let page: Awaited<ReturnType<typeof provider.listPage>>;
  try {
    page = await provider.listPage(scope, search.stream, {
      from: new Date(search.from),
      to: new Date(search.to),
      ...(search.cursor ? { startingAfter: search.cursor } : {}),
      pageSize: 10,
    });
  } catch (error) {
    if (
      !(error instanceof FinanceStripeReconciliationError) ||
      error.reason !== "INVALID_CURSOR"
    )
      throw error;
    result.search = { ...search, cursor: null, exhausted: false };
    result.issue = "INVALID_SEARCH_CURSOR";
    return result;
  }
  const candidates = page.data.filter((object) =>
    matchesFinanceUnresolvedMetadata(operation, object),
  );
  if (operation.kind === "mandate") {
    result.mandateObjects.push(
      ...candidates.map((object) =>
        parseFinanceMandateServicingObject(
          scope,
          "setupIntents",
          object.id,
          object,
        ),
      ),
    );
  } else
    result.objects = await prepareFinanceReconciliationObjects(
      scope,
      search.stream,
      candidates,
      provider,
    );
  result.search = {
    ...search,
    cursor: page.nextCursor,
    exhausted: page.nextCursor === null,
  };
  return finish();
}
