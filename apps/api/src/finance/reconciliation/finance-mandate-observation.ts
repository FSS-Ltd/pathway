import type { FinanceMandateServicingObject } from "../stripe/finance-stripe-mandate-servicing.contracts";
import type { FinanceProviderObservation } from "./finance-provider-observation.persistence";
import { projectFinanceBacsObject } from "./finance-bacs-object.projection";

/** A current state is observed now; created/accepted_at is not its change time. */
export function projectFinanceMandateObservation(
  livemode: boolean,
  object: FinanceMandateServicingObject,
): Omit<FinanceProviderObservation, "origin"> {
  const observedType = `finance.reconciliation.${object.object}.observed`;
  let eventType = observedType;
  let minimal: FinanceProviderObservation["object"] = {
    id: object.id,
    object: object.object,
  };
  let disposition: FinanceProviderObservation["disposition"] = "observed";
  if (object.object === "setup_intent") {
    minimal = {
      ...minimal,
      status: object.status,
      customer: object.customer,
      payment_method: object.payment_method,
      mandate: object.mandate,
      metadata: {
        ...(object.metadata.finance_mandate_id
          ? { finance_mandate_id: object.metadata.finance_mandate_id }
          : {}),
        ...(object.metadata.finance_payer_account_id
          ? {
              finance_payer_account_id:
                object.metadata.finance_payer_account_id,
            }
          : {}),
        ...(object.metadata.finance_consent_version
          ? { finance_consent_version: object.metadata.finance_consent_version }
          : {}),
      },
    };
    if (object.status === "succeeded") eventType = "setup_intent.succeeded";
    if (object.status === "canceled") eventType = "setup_intent.setup_failed";
  } else if (object.object === "mandate") {
    minimal = {
      ...minimal,
      status: object.status,
      payment_method: object.payment_method,
    };
    if (object.status === "inactive") eventType = "mandate.updated";
  } else {
    minimal = { ...minimal, customer: object.customer };
    if (object.type !== "bacs_debit") disposition = "hold";
    else if (object.customer === null) eventType = "payment_method.detached";
  }
  if (eventType !== observedType) {
    const canonical = projectFinanceBacsObject(eventType, minimal);
    if (canonical) {
      minimal = canonical;
      disposition = "queue";
    } else disposition = "hold";
  }
  if (object.livemode !== livemode) disposition = "hold";
  return {
    eventType,
    object: minimal,
    disposition,
    resourceReference: object.id,
  };
}
