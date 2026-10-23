const mockFind = jest.fn();
const mockUpdate = jest.fn();
const mockTenant = jest.fn();
jest.mock("@pathway/db", () => ({
  runTransaction: jest.fn(),
  withTenantRlsContext: mockTenant,
}));
import { PrismaFinanceStripeWebhookStore } from "../finance-stripe-webhook.store";
describe("canonical inbox scheduled environment isolation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFind.mockResolvedValue([
      { id: "evidence", tenantId: "tenant", orgId: "org", attempts: 0 },
    ]);
    mockUpdate.mockResolvedValue({ count: 1 });
    mockTenant.mockImplementation(
      (_tenant: string, _org: string, callback: (tx: unknown) => unknown) =>
        callback({
          financeStripeWebhookEvent: {
            findMany: mockFind,
            updateMany: mockUpdate,
          },
        }),
    );
  });
  it.each([false, true])(
    "scopes selection and compare-and-set to livemode=%s",
    async (livemode) => {
      await new PrismaFinanceStripeWebhookStore(livemode).claim(
        { tenantId: "tenant", orgId: "org" },
        new Date(),
        new Date(0),
        "claim",
        50,
      );
      expect(mockFind).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ livemode }),
        }),
      );
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ livemode }),
        }),
      );
    },
  );
});
