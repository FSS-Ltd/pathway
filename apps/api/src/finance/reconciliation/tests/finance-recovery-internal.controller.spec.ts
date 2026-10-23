import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { FinanceRecoveryInternalController } from "../finance-recovery-internal.controller";
import { FinanceRecoveryService } from "../finance-recovery.service";
import { FinanceReconciliationStateRepository } from "../finance-reconciliation-state.repository";
const body = {
  tenantId: "tenant",
  orgId: "org",
  connectionId: "11111111-1111-4111-8111-111111111111",
  stream: "events",
};
describe("internal Finance recovery boundary", () => {
  const originalSecret = process.env.INTERNAL_AUTH_SECRET;
  afterEach(() => {
    if (originalSecret === undefined) delete process.env.INTERNAL_AUTH_SECRET;
    else process.env.INTERNAL_AUTH_SECRET = originalSecret;
    jest.restoreAllMocks();
  });
  function setup() {
    const service = new FinanceRecoveryService(
      { mode: "disabled" },
      new FinanceReconciliationStateRepository(),
    );
    const run = jest.spyOn(service, "run").mockResolvedValue({
      mode: "dry-run",
      status: "disabled",
      pages: 0,
      objects: 0,
      recoverable: 0,
      exceptions: 0,
    });
    return { run, controller: new FinanceRecoveryInternalController(service) };
  }
  it("rejects missing, wrong and unconfigured secrets before work", async () => {
    const { run, controller } = setup();
    process.env.INTERNAL_AUTH_SECRET = "synthetic-secret";
    for (const secret of [undefined, "wrong", "same-length-value"])
      await expect(controller.run(secret, body)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    delete process.env.INTERNAL_AUTH_SECRET;
    await expect(
      controller.run("synthetic-secret", body),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(run).not.toHaveBeenCalled();
  });
  it("rejects forged provider scope and unknown streams", async () => {
    const { run, controller } = setup();
    process.env.INTERNAL_AUTH_SECRET = "synthetic-secret";
    for (const invalid of [
      { ...body, stripeAccountId: "acct_forged" },
      { ...body, livemode: true },
      { ...body, stream: "arbitrary" },
    ])
      await expect(
        controller.run("synthetic-secret", invalid),
      ).rejects.toBeInstanceOf(BadRequestException);
    expect(run).not.toHaveBeenCalled();
  });
  it("defaults an authenticated valid request to dry run and sends private responses", async () => {
    const { run, controller } = setup();
    process.env.INTERNAL_AUTH_SECRET = "synthetic-secret";
    await expect(
      controller.run("synthetic-secret", body),
    ).resolves.toMatchObject({ status: "disabled" });
    expect(run).toHaveBeenCalledWith({ ...body, mode: "dry-run" });
    expect(
      Reflect.getMetadata(
        "__headers__",
        FinanceRecoveryInternalController.prototype.run,
      ),
    ).toContainEqual({ name: "Cache-Control", value: "private, no-store" });
  });
});
