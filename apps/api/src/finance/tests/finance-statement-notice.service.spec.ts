import { withTenantRlsContext } from "@pathway/db";
import type { FinanceAccessService } from "../access/finance-access.service";
import type { MailerService } from "../../mailer/mailer.service";
import { FinanceStatementNoticeService } from "../finance-statement-notice.service";

jest.mock("@pathway/db", () => ({ withTenantRlsContext: jest.fn() }));

const intent = {
  eventType: "finance.statement.notice.requested",
  aggregateType: "FINANCE_STATEMENT",
  aggregateId: "4e8e0c5c-3e7e-4fab-9d79-b4099c507050",
  idempotencyKey: "finance-statement-notice:test",
  payload: {
    tenantId: "tenant-a",
    orgId: "org-a",
    statementId: "4e8e0c5c-3e7e-4fab-9d79-b4099c507050",
    payerAccountId: "397d71dd-0284-47a2-b13a-b9d3b2ad47c2",
    payerUserId: "5b496c7a-d6ee-4d36-9f3e-c12c9fca94b0",
  },
};

function setup(grant: unknown = null) {
  const tx = {
    financeStatement: {
      findFirst: jest.fn().mockResolvedValue({
        periodStart: new Date("2026-08-31T23:00:00.000Z"),
        periodEnd: new Date("2026-09-30T23:00:00.000Z"),
      }),
    },
    financePayerGrant: { findFirst: jest.fn().mockResolvedValue(grant) },
    org: {
      findUnique: jest.fn().mockResolvedValue({ name: "Example School" }),
    },
  };
  jest
    .mocked(withTenantRlsContext)
    .mockImplementation(async (_tenant, _org, callback) =>
      callback(tx as never),
    );
  const access = { resolveMode: jest.fn().mockResolvedValue("ACTIVE") };
  const mailer = {
    sendFinanceStatementNotice: jest.fn().mockResolvedValue(undefined),
  };
  const service = new FinanceStatementNoticeService(
    access as unknown as FinanceAccessService,
    mailer as unknown as MailerService,
  );
  return { service, access, mailer, tx };
}

describe("FinanceStatementNoticeService", () => {
  const originalSiteUrl = process.env.SITE_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SITE_URL = "https://family.example.test";
  });

  afterAll(() => {
    if (originalSiteUrl === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = originalSiteUrl;
  });

  it("suppresses notices after payer access has been revoked", async () => {
    const { service, mailer } = setup(null);

    await expect(service.dispatch(intent)).resolves.toEqual({ sent: false });

    expect(mailer.sendFinanceStatementNotice).not.toHaveBeenCalled();
  });

  it("sends only a secure statement link without financial details", async () => {
    const grant = {
      payer: {
        id: intent.payload.payerUserId,
        email: "family@example.test",
        name: "Jamie Parent",
        displayName: null,
        firstName: null,
      },
    };
    const { service, mailer } = setup(grant);

    await expect(service.dispatch(intent)).resolves.toEqual({ sent: true });

    expect(mailer.sendFinanceStatementNotice).toHaveBeenCalledWith({
      to: "family@example.test",
      recipientName: "Jamie Parent",
      organisationName: "Example School",
      periodLabel: "September 2026",
      statementUrl: `https://family.example.test/family/finance/statements/${intent.payload.statementId}`,
      statementId: intent.payload.statementId,
      recipientUserId: intent.payload.payerUserId,
    });
  });

  it("does not read statement data or send a notice when Finance is locked", async () => {
    const { service, access, mailer } = setup({});
    access.resolveMode.mockResolvedValue("LOCKED");

    await expect(service.dispatch(intent)).resolves.toEqual({ sent: false });

    expect(withTenantRlsContext).not.toHaveBeenCalled();
    expect(mailer.sendFinanceStatementNotice).not.toHaveBeenCalled();
  });
});
