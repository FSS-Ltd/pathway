import { executeFinanceRecoveryCli } from "../finance-recovery-cli";
const args = [
  "--tenant",
  "school-private",
  "--org",
  "organisation-private",
  "--connection",
  "11111111-1111-4111-8111-111111111111",
  "--stream",
  "events",
];
const env = {
  DATABASE_URL: "postgresql://synthetic:synthetic@localhost/synthetic",
  FINANCE_STRIPE_SERVICING_MODE: "test",
  FINANCE_STRIPE_SERVICING_SECRET_KEY_TEST: "sk_test_private",
  NODE_ENV: "test",
};
const counts = {
  mode: "dry-run" as const,
  status: "completed" as const,
  pages: 1,
  objects: 2,
  recoverable: 1,
  exceptions: 0,
};
describe("redacted reconciliation CLI execution", () => {
  it("defaults to dry run with explicit servicing configuration and only prints safe result fields", async () => {
    const run = jest.fn().mockResolvedValue({
      ...counts,
      accountId: "acct_private",
      payload: { secret: "private" },
    });
    const result = await executeFinanceRecoveryCli(args, env, run);
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "dry-run", tenantId: "school-private" }),
      { mode: "test", secretKey: "sk_test_private" },
    );
    expect(result).toEqual({ exitCode: 0, output: JSON.stringify(counts) });
    expect(result.output).not.toContain("private");
  });
  it("does not load runtime for help, bad arguments, bad configuration or disabled servicing", async () => {
    const run = jest.fn();
    expect(
      (await executeFinanceRecoveryCli(["--help"], {}, run)).exitCode,
    ).toBe(0);
    expect((await executeFinanceRecoveryCli([], env, run)).exitCode).toBe(1);
    expect(
      (
        await executeFinanceRecoveryCli(
          args,
          {
            ...env,
            FINANCE_STRIPE_SERVICING_SECRET_KEY_TEST: "sk_live_private",
          },
          run,
        )
      ).output,
    ).toContain("invalid_configuration");
    expect(await executeFinanceRecoveryCli(args, {}, run)).toMatchObject({
      exitCode: 2,
      output: expect.stringContaining('"status":"disabled"'),
    });
    expect(
      (await executeFinanceRecoveryCli(args, { ...env, DATABASE_URL: "" }, run))
        .output,
    ).toContain("invalid_configuration");
    expect(run).not.toHaveBeenCalled();
  });
  it("redacts thrown provider details and marks incomplete outcomes as non-completion", async () => {
    const failure = await executeFinanceRecoveryCli(
      args,
      env,
      jest
        .fn()
        .mockRejectedValue(
          new Error("sk_test_private acct_private payer_private"),
        ),
    );
    expect(failure.exitCode).toBe(1);
    expect(failure.output).not.toContain("private");
    expect(
      (
        await executeFinanceRecoveryCli(
          args,
          env,
          jest.fn().mockResolvedValue({ ...counts, status: "continued" }),
        )
      ).exitCode,
    ).toBe(2);
  });
});
