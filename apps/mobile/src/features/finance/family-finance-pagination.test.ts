import { apiClient } from "@/lib/api/client";
import { listFamilyInvoices, listFamilyStatements } from "./family-finance-api";

jest.mock("@/config/env", () => ({
  env: { apiUrl: "https://api.example.test" },
}));

const originalFetch = global.fetch;

describe("Family Finance history requests", () => {
  afterEach(() => {
    global.fetch = originalFetch;
    apiClient.setAccessToken(null);
  });

  it.each([
    ["invoices", listFamilyInvoices],
    ["statements", listFamilyStatements],
  ] as const)(
    "encodes account and cursor scope for older %s without losing the next page",
    async (kind, list) => {
      const fetchPage = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ items: [], nextCursor: "following-page" }),
      });
      global.fetch = fetchPage;
      apiClient.setAccessToken("payer-token");
      await expect(list("account/one", "cursor&other=two")).resolves.toEqual({
        items: [],
        nextCursor: "following-page",
      });
      expect(fetchPage).toHaveBeenCalledWith(
        `https://api.example.test/finance/payer-accounts/account%2Fone/${kind}?limit=100&cursor=cursor%26other%3Dtwo`,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer payer-token",
          }),
        }),
      );
    },
  );
});
