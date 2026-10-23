const mockQuery = jest.fn();
const mockExecute = jest.fn();
const mockTransaction = jest.fn();
jest.mock("@pathway/db", () => ({ runTransaction: mockTransaction }));
import { PrismaFinanceReconciliationStore } from "../finance-reconciliation.store";
const work = {
  tenantId: "tenant",
  orgId: "org",
  connectionId: "00000000-0000-4000-8000-000000000001",
  stream: "caseRequests",
};
describe("backend-only recovery scope discovery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTransaction.mockImplementation(
      (
        callback: (tx: {
          $queryRaw: typeof mockQuery;
          $executeRaw: typeof mockExecute;
        }) => unknown,
      ) => callback({ $queryRaw: mockQuery, $executeRaw: mockExecute }),
    );
    mockQuery.mockResolvedValue([work]);
  });
  it("uses the granted SQL function with explicit mode and bounded discovery", async () => {
    const now = new Date();
    await expect(
      new PrismaFinanceReconciliationStore().findDue(now, false, 100),
    ).resolves.toEqual([work]);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.any(Array),
      now,
      false,
      100,
      [],
    );
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });
  it("rejects unknown streams, invalid identities and unbounded scans", async () => {
    const store = new PrismaFinanceReconciliationStore();
    await expect(store.findDue(new Date(), true, 101)).rejects.toThrow();
    mockQuery.mockResolvedValue([{ ...work, stream: "arbitraryMutation" }]);
    await expect(store.findDue(new Date(), true, 100)).rejects.toThrow();
    mockQuery.mockResolvedValue([{ ...work, connectionId: "wrong-id" }]);
    await expect(store.findDue(new Date(), true, 100)).rejects.toThrow();
  });
  it("passes bounded validated exclusions without changing durable state", async () => {
    const excluded = [`${work.connectionId}:${work.stream}`];
    await new PrismaFinanceReconciliationStore().findDue(
      new Date(),
      false,
      100,
      excluded,
    );
    expect(mockQuery).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Date),
      false,
      100,
      excluded,
    );
  });
  it("rejects malformed, unknown-stream and oversized exclusions before touching the database", async () => {
    const store = new PrismaFinanceReconciliationStore();
    for (const excluded of [
      ["invalid"],
      [`${work.connectionId}:arbitraryMutation`],
      Array.from({ length: 501 }, () => `${work.connectionId}:${work.stream}`),
    ]) {
      await expect(
        store.findDue(new Date(), false, 100, excluded),
      ).rejects.toThrow();
    }
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
