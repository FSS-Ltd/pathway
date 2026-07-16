import { transactionOptions } from "../index";

describe("transactionOptions", () => {
  it("widens maxWait past Prisma's 2s default so pooled-connection contention queues instead of throwing 'Unable to start a transaction in the given time'", () => {
    expect(transactionOptions.maxWait).toBeGreaterThanOrEqual(10_000);
    expect(transactionOptions.timeout).toBeGreaterThan(transactionOptions.maxWait);
  });
});
