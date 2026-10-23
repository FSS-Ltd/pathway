import type { Prisma } from "@pathway/db";
const mockWithContext = jest.fn();
jest.mock("@pathway/db", () => ({ withTenantRlsContext: mockWithContext }));
import { FinanceStripeAccountSyncService } from "../finance-stripe-account-sync.service";

describe("Finance servicing account sync", () => {
  const connection = {
    id: "connection",
    livemode: false,
    status: "CONNECTING",
    countryCode: "GB",
  };
  let inTransaction: boolean;
  let query: jest.Mock;
  let updateMany: jest.Mock;
  let reader: { retrieveAccount: jest.Mock };
  let service: FinanceStripeAccountSyncService;

  beforeEach(() => {
    jest.clearAllMocks();
    inTransaction = false;
    query = jest.fn().mockResolvedValue([connection]);
    updateMany = jest.fn().mockResolvedValue({ count: 1 });
    // Only the operations this service uses are needed in its transaction double.
    const tx = {
      $queryRaw: query,
      financeStripeConnection: { updateMany },
    } as unknown as Prisma.TransactionClient;
    mockWithContext.mockImplementation(
      async (
        _tenant: string,
        _org: string,
        callback: (client: Prisma.TransactionClient) => Promise<unknown>,
      ) => {
        inTransaction = true;
        try {
          return await callback(tx);
        } finally {
          inTransaction = false;
        }
      },
    );
    reader = {
      retrieveAccount: jest.fn().mockImplementation(async () => {
        expect(inTransaction).toBe(false);
        return {
          id: "acct_school",
          livemode: false,
          country: "GB",
          cardPaymentsStatus: "active",
        };
      }),
    };
    service = new FinanceStripeAccountSyncService(reader);
  });

  it("reads Stripe outside database transactions and locks current state before updating", async () => {
    await service.refreshFromWebhook("tenant", "org", "acct_school");
    expect(reader.retrieveAccount).toHaveBeenCalledWith("acct_school");
    expect(query).toHaveBeenCalledTimes(2);
    expect(mockWithContext).toHaveBeenCalledWith(
      "tenant",
      "org",
      expect.any(Function),
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "connection",
        tenantId: "tenant",
        orgId: "org",
        stripeAccountId: "acct_school",
        livemode: false,
        status: { not: "DISCONNECTED" },
      },
      data: { status: "READY" },
    });
  });

  it("does not revive an already disconnected connection", async () => {
    query.mockResolvedValue([{ ...connection, status: "DISCONNECTED" }]);
    await service.refreshFromWebhook("tenant", "org", "acct_school");
    expect(reader.retrieveAccount).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it.each([
    { capability: "pending", status: "CONNECTING" },
    { capability: "inactive", status: "RESTRICTED" },
  ])(
    "preserves the provider's non-active collection state",
    async ({ capability, status }) => {
      reader.retrieveAccount.mockResolvedValue({
        id: "acct_school",
        livemode: false,
        country: "GB",
        cardPaymentsStatus: capability,
      });
      await service.refreshFromWebhook("tenant", "org", "acct_school");
      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status } }),
      );
    },
  );

  it("does not revive a connection disconnected while Stripe was responding", async () => {
    query
      .mockResolvedValueOnce([connection])
      .mockResolvedValueOnce([{ ...connection, status: "DISCONNECTED" }]);
    await service.refreshFromWebhook("tenant", "org", "acct_school");
    expect(reader.retrieveAccount).toHaveBeenCalledTimes(1);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it.each([{ livemode: true }, { country: "NL" }, { id: "acct_other" }])(
    "rejects a provider response that does not match current school identity",
    async (override) => {
      reader.retrieveAccount.mockResolvedValue({
        id: "acct_school",
        livemode: false,
        country: "GB",
        cardPaymentsStatus: "active",
        ...override,
      });
      await expect(
        service.refreshFromWebhook("tenant", "org", "acct_school"),
      ).rejects.toThrow("match");
      expect(updateMany).not.toHaveBeenCalled();
    },
  );
});
