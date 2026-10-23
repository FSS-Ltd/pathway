import { withTenantRlsContext } from "@pathway/db";
import { FinanceBalanceService } from "../finance-balance.service";
import { FinanceReportRepository } from "../finance-report.repository";

jest.mock("@pathway/db", () => ({ withTenantRlsContext: jest.fn() }));

const actor = { tenantId: "tenant-a", orgId: "org-a", userId: "staff-a" };
const filters = { from: "2026-10-01", to: "2026-10-23", asOf: "2026-10-23" };

function setup() {
  const events = [
    {
      id: "dead",
      tenantId: "tenant-a",
      orgId: "org-a",
      stripeEventId: "evt_dead",
      eventType: "checkout.session.completed",
      status: "DEAD_LETTER",
      receivedAt: new Date("2026-10-20T12:00:00Z"),
      lastError: "private provider details",
      payloadJson: { payer: "private child name" },
    },
    {
      id: "retry",
      tenantId: "tenant-a",
      orgId: "org-a",
      stripeEventId: "evt_retry",
      eventType: "checkout.session.completed",
      status: "RETRY",
      receivedAt: new Date("2026-10-20T12:00:00Z"),
      lastError: "private provider details",
      payloadJson: {},
    },
    {
      id: "pending-handler",
      tenantId: "tenant-a",
      orgId: "org-a",
      stripeEventId: "evt_handler",
      eventType: "unrecognised.event",
      status: "AWAITING_HANDLER",
      receivedAt: new Date("2026-10-20T12:00:00Z"),
      lastError: null,
      payloadJson: {},
    },
    {
      id: "completed",
      tenantId: "tenant-a",
      orgId: "org-a",
      stripeEventId: "evt_completed",
      eventType: "checkout.session.completed",
      status: "COMPLETED",
      receivedAt: new Date("2026-10-20T12:00:00Z"),
      lastError: null,
      payloadJson: {},
    },
    {
      id: "other-tenant",
      tenantId: "tenant-b",
      orgId: "org-a",
      stripeEventId: "evt_other_tenant",
      eventType: "checkout.session.completed",
      status: "DEAD_LETTER",
      receivedAt: new Date("2026-10-20T12:00:00Z"),
      lastError: null,
      payloadJson: {},
    },
    {
      id: "other-org",
      tenantId: "tenant-a",
      orgId: "org-b",
      stripeEventId: "evt_other_org",
      eventType: "checkout.session.completed",
      status: "DEAD_LETTER",
      receivedAt: new Date("2026-10-20T12:00:00Z"),
      lastError: null,
      payloadJson: {},
    },
    {
      id: "future",
      tenantId: "tenant-a",
      orgId: "org-a",
      stripeEventId: "evt_future",
      eventType: "checkout.session.completed",
      status: "DEAD_LETTER",
      receivedAt: new Date("2026-10-24T12:00:00Z"),
      lastError: null,
      payloadJson: {},
    },
  ];
  const empty = () => ({ findMany: jest.fn().mockResolvedValue([]) });
  const tx = {
    financeReconciliationCase: empty(),
    financeProfile: {
      findUnique: jest.fn().mockResolvedValue({
        id: "profile-a",
        legalEntityName: "Synthetic school",
        currency: "GBP",
      }),
    },
    financeStripeConnection: { findFirst: jest.fn().mockResolvedValue(null) },
    financeInvoice: empty(),
    financeCreditNote: empty(),
    financeReceipt: empty(),
    financeReceiptMovement: empty(),
    financeReceiptAllocation: empty(),
    financeRefund: empty(),
    financeManualReceiptRequest: empty(),
    financeTransferNotice: empty(),
    financeStripeWebhookEvent: {
      findMany: jest.fn().mockImplementation(
        async ({
          where,
        }: {
          where: {
            tenantId: string;
            orgId: string;
            receivedAt: { lte: Date };
            status: { in: string[] };
          };
        }) =>
          events.filter(
            (event) =>
              event.tenantId === where.tenantId &&
              event.orgId === where.orgId &&
              event.receivedAt <= where.receivedAt.lte &&
              where.status.in.includes(event.status),
          ),
      ),
    },
  };
  // The transaction fake exposes only the repository's persistence boundary.
  jest
    .mocked(withTenantRlsContext)
    .mockImplementation(async (_tenant, _org, callback) =>
      callback(tx as never),
    );
  return new FinanceReportRepository(new FinanceBalanceService());
}

describe("Finance webhook operator exceptions", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows failed durable evidence as a nonmonetary operator exception instead of silently omitting it", async () => {
    const report = await setup().loadSnapshot(actor, filters);
    expect(report.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recordType: "exceptions",
          reference: "evt_dead",
          status: "WEBHOOK_DEAD_LETTER",
          amountMinor: null,
          currency: null,
        }),
      ]),
    );
    expect(report.totals?.confirmedReceiptsMinor).toBe("0");
    expect(report.totals?.outstandingMinor).toBe("0");
  });

  it("scopes review evidence to the tenant, organisation and report cutoff without exposing raw errors or payloads", async () => {
    const report = await setup().loadSnapshot(actor, filters);
    expect(report.rows.map((row) => row.reference).sort()).toEqual([
      "evt_dead",
      "evt_handler",
      "evt_retry",
    ]);
    expect(
      report.rows.every(
        (row) => row.amountMinor === null && row.currency === null,
      ),
    ).toBe(true);
    expect(JSON.stringify(report.rows)).not.toMatch(
      /private provider details|private child name/,
    );
    expect(report.metadata.ledgerCutoffAt).toBe("2026-10-23T22:59:59.999Z");
  });
});
