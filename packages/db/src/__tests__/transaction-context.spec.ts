import type { Prisma } from "@prisma/client";
import {
  activeTransaction,
  runWithTransaction,
  type ActiveTransaction,
} from "../transaction-context";

const client = {} as Prisma.TransactionClient;
const tenantTransaction: ActiveTransaction = {
  client,
  scope: {
    kind: "tenant",
    tenantId: "site-a",
    orgId: "org-a",
    readOnly: false,
  },
};

describe("transaction context", () => {
  it("reuses the active client for the same site and leaves no context afterward", async () => {
    await runWithTransaction(tenantTransaction, async () => {
      expect(activeTransaction()?.client).toBe(client);
      await runWithTransaction(tenantTransaction, async () => {
        expect(activeTransaction()?.client).toBe(client);
      });
    });
    expect(activeTransaction()).toBeUndefined();
  });

  it("rejects a different organisation or site before running the callback", async () => {
    const callback = jest.fn(async () => undefined);
    await runWithTransaction(tenantTransaction, async () => {
      expect(() =>
        runWithTransaction(
          {
            client,
            scope: {
              kind: "tenant",
              tenantId: "site-b",
              orgId: "org-a",
              readOnly: false,
            },
          },
          callback,
        ),
      ).toThrow("Cannot change the scope");
      expect(() =>
        runWithTransaction(
          {
            client,
            scope: { kind: "org", orgId: "org-a", readOnly: true },
          },
          callback,
        ),
      ).toThrow("Cannot change the scope");
    });
    expect(callback).not.toHaveBeenCalled();
  });

  it("rejects a different client and read-only escalation", async () => {
    const readOnly: ActiveTransaction = {
      client,
      scope: { kind: "org", orgId: "org-a", readOnly: true },
    };
    await runWithTransaction(readOnly, async () => {
      expect(() =>
        runWithTransaction(
          { client, scope: { kind: "org", orgId: "org-a", readOnly: false } },
          async () => undefined,
        ),
      ).toThrow("Cannot write inside a read-only");
    });
    await runWithTransaction(tenantTransaction, async () => {
      expect(() =>
        runWithTransaction(
          { ...tenantTransaction, client: {} as Prisma.TransactionClient },
          async () => undefined,
        ),
      ).toThrow("Cannot replace an active");
    });
  });
});
