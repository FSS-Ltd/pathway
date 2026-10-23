import { projectFinanceMandateObservation } from "./finance-mandate-observation";
import type { FinanceMandateServicingObject } from "../stripe/finance-stripe-mandate-servicing.contracts";

const setup: Extract<
  FinanceMandateServicingObject,
  { object: "setup_intent" }
> = {
  id: "seti_fixture",
  object: "setup_intent",
  created: 1_790_000_000,
  livemode: false,
  status: "succeeded",
  customer: "cus_fixture",
  payment_method: "pm_fixture",
  mandate: "mandate_fixture",
  metadata: {
    finance_mandate_id: "local",
    finance_payer_account_id: "payer",
    finance_consent_version: "consent",
  },
};

describe("current mandate observations", () => {
  it("queues complete success without treating creation time as acceptance", () => {
    expect(projectFinanceMandateObservation(false, setup)).toMatchObject({
      eventType: "setup_intent.succeeded",
      disposition: "queue",
      object: { id: setup.id, status: "succeeded" },
    });
    expect(
      projectFinanceMandateObservation(false, setup).object,
    ).not.toHaveProperty("created");
  });
  it.each([
    "processing",
    "requires_payment_method",
    "requires_action",
    "requires_confirmation",
  ] as const)("observes %s without inventing failure", (status) => {
    expect(
      projectFinanceMandateObservation(false, { ...setup, status }),
    ).toMatchObject({
      eventType: "finance.reconciliation.setup_intent.observed",
      disposition: "observed",
    });
  });
  it("queues an explicit canceled setup", () => {
    expect(
      projectFinanceMandateObservation(false, { ...setup, status: "canceled" }),
    ).toMatchObject({
      eventType: "setup_intent.setup_failed",
      disposition: "queue",
    });
  });
  it("holds a different environment and incomplete success", () => {
    expect(projectFinanceMandateObservation(true, setup).disposition).toBe(
      "hold",
    );
    expect(
      projectFinanceMandateObservation(false, { ...setup, mandate: null })
        .disposition,
    ).toBe("hold");
  });
  it("observes active mandates without inventing creation time or clearing pending cancellation", () => {
    expect(
      projectFinanceMandateObservation(false, {
        id: "mandate_fixture",
        object: "mandate",
        livemode: false,
        status: "active",
        payment_method: "pm_fixture",
        acceptedAt: 1_790_000_000,
      }),
    ).toMatchObject({
      eventType: "finance.reconciliation.mandate.observed",
      disposition: "observed",
    });
  });
  it("queues only actual inactivity or detachment", () => {
    expect(
      projectFinanceMandateObservation(false, {
        id: "mandate_fixture",
        object: "mandate",
        livemode: false,
        status: "inactive",
        payment_method: "pm_fixture",
        acceptedAt: null,
      }).eventType,
    ).toBe("mandate.updated");
    const method = {
      id: "pm_fixture",
      object: "payment_method" as const,
      livemode: false,
      created: 1_790_000_000,
      type: "bacs_debit",
      customer: null,
    };
    expect(projectFinanceMandateObservation(false, method)).toMatchObject({
      eventType: "payment_method.detached",
      disposition: "queue",
    });
    expect(
      projectFinanceMandateObservation(false, {
        ...method,
        customer: "cus_fixture",
      }).disposition,
    ).toBe("observed");
    expect(
      projectFinanceMandateObservation(false, { ...method, type: "card" })
        .disposition,
    ).toBe("hold");
  });
});
