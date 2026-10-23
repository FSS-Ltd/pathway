import {
  projectFinanceDispute,
  projectFinanceRefund,
} from "../finance-reversal-observation";

const refund = {
  id: "re_payment",
  object: "refund",
  amount: 1000,
  currency: "gbp",
  status: "succeeded",
  payment_intent: "pi_payment",
  charge: "py_payment",
  metadata: { finance_refund_id: "refund-operation" },
};
const withdrawal = {
  id: "txn_withdrawal",
  object: "balance_transaction",
  created: 1_800_000_000,
  amount: -1000,
  fee: 1500,
  net: -2500,
  currency: "gbp",
};
const reinstatement = {
  id: "txn_reinstatement",
  object: "balance_transaction",
  created: 1_800_086_400,
  amount: 1000,
  fee: -1500,
  net: 2500,
  currency: "gbp",
};
const dispute = {
  id: "du_payment",
  object: "dispute",
  amount: 1000,
  currency: "gbp",
  payment_intent: "pi_payment",
  charge: "py_payment",
  status: "won",
  balance_transactions: [withdrawal, reinstatement],
};

describe("provider-confirmed reversal observations", () => {
  it("projects a confirmed refund without copying private metadata or payment secrets", () => {
    const projected = projectFinanceRefund({
      ...refund,
      description: "Private notes",
      instructions_email: "private@example.test",
      metadata: { ...refund.metadata, private_note: "Private notes" },
      payment_intent: { id: "pi_payment", client_secret: "fixture-secret" },
    });
    expect(projected).toEqual({
      observations: [{ eventType: "refund.updated", object: refund }],
      issue: null,
    });
  });

  it("normalizes nullable metadata without inventing a local refund identity", () => {
    expect(
      projectFinanceRefund({ ...refund, metadata: null }).observations[0]
        ?.object.metadata,
    ).toEqual({});
  });

  it("does not infer a successful family refund from processor debit and reversal transactions", () => {
    const projected = projectFinanceRefund({
      ...refund,
      status: "failed",
      balance_transaction: withdrawal,
      failure_balance_transaction: reinstatement,
    });
    expect(projected.issue).toBeNull();
    expect(projected.observations).toHaveLength(1);
    expect(projected.observations[0]?.eventType).toBe("refund.failed");
    expect(projected.observations[0]?.object.status).toBe("failed");
  });

  it.each(["pending", "requires_action", "canceled"])(
    "preserves an unconfirmed refund status: %s",
    (status) => {
      const projected = projectFinanceRefund({ ...refund, status });
      expect(projected.issue).toBeNull();
      expect(projected.observations[0]?.object.status).toBe(status);
    },
  );

  it.each([
    { amount: Number.MAX_SAFE_INTEGER + 1 },
    { charge: "pi_wrong" },
    { status: "unknown" },
  ])("rejects invalid refund evidence", (override) => {
    expect(projectFinanceRefund({ ...refund, ...override }).issue).toBe(
      "INVALID_REFUND",
    );
  });

  it("recovers both dispute movements using transaction times and principal amounts", () => {
    const projected = projectFinanceDispute(dispute);
    expect(projected.issue).toBeNull();
    expect(
      projected.observations.map((row) => ({
        type: row.eventType,
        movement: row.movement,
        amount: row.object.amount,
      })),
    ).toEqual([
      {
        type: "charge.dispute.funds_withdrawn",
        movement: { id: withdrawal.id, created: withdrawal.created },
        amount: 1000,
      },
      {
        type: "charge.dispute.funds_reinstated",
        movement: { id: reinstatement.id, created: reinstatement.created },
        amount: 1000,
      },
    ]);
    expect(JSON.stringify(projected)).not.toContain('"fee"');
    expect(JSON.stringify(projected)).not.toContain('"net"');
  });

  it("does not infer money movements from a lost or won dispute status", () => {
    for (const status of ["lost", "won", "warning_closed"])
      expect(
        projectFinanceDispute({ ...dispute, status, balance_transactions: [] }),
      ).toEqual({ observations: [], issue: null });
  });

  it("orders reinstatement after the proved withdrawal regardless of array order", () => {
    expect(
      projectFinanceDispute({
        ...dispute,
        balance_transactions: [reinstatement, withdrawal],
      }).observations.map((row) => row.eventType),
    ).toEqual([
      "charge.dispute.funds_withdrawn",
      "charge.dispute.funds_reinstated",
    ]);
  });

  it.each([
    { balance_transactions: [withdrawal.id, reinstatement.id] },
    { balance_transactions: undefined },
    { balance_transactions: [reinstatement] },
    { balance_transactions: [withdrawal, { ...withdrawal, id: "txn_extra" }] },
    { balance_transactions: [{ ...withdrawal, currency: "eur" }] },
    {
      balance_transactions: [
        withdrawal,
        { ...reinstatement, created: withdrawal.created - 1 },
      ],
    },
  ])(
    "surfaces incomplete, ambiguous or incompatible dispute movement evidence",
    (override) => {
      const projected = projectFinanceDispute({ ...dispute, ...override });
      expect(projected.observations).toEqual([]);
      expect(projected.issue).not.toBeNull();
    },
  );
});
