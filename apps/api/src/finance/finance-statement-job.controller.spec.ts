import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { FinanceStatementJobController } from "./finance-statement-job.controller";
import { FinanceStatementService } from "./finance-statement.service";

describe("FinanceStatementJobController", () => {
  const originalSecret = process.env.FINANCE_STATEMENT_MONTH_END_SECRET;
  const statements = {
    generateMonthEndForAll: jest
      .fn<
        ReturnType<FinanceStatementService["generateMonthEndForAll"]>,
        Parameters<FinanceStatementService["generateMonthEndForAll"]>
      >()
      .mockResolvedValue({
        month: "2026-09",
        organisationsProcessed: 1,
        statementsReady: 2,
      }),
  };
  const controller = new FinanceStatementJobController(
    statements as unknown as FinanceStatementService,
  );

  beforeEach(() => {
    process.env.FINANCE_STATEMENT_MONTH_END_SECRET = "scheduled-job-secret";
    statements.generateMonthEndForAll.mockClear();
  });

  afterAll(() => {
    if (originalSecret === undefined) {
      delete process.env.FINANCE_STATEMENT_MONTH_END_SECRET;
    } else {
      process.env.FINANCE_STATEMENT_MONTH_END_SECRET = originalSecret;
    }
  });

  it("generates the requested closed month after internal authentication", async () => {
    await expect(
      controller.generateMonthEnd("scheduled-job-secret", {
        month: "2026-09",
      }),
    ).resolves.toEqual({
      month: "2026-09",
      organisationsProcessed: 1,
      statementsReady: 2,
    });
    expect(statements.generateMonthEndForAll).toHaveBeenCalledWith("2026-09");
  });

  it("rejects requests without a valid internal secret", async () => {
    await expect(
      controller.generateMonthEnd("wrong-secret", { month: "2026-09" }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(statements.generateMonthEndForAll).not.toHaveBeenCalled();
  });

  it("validates the month before starting cross-organisation work", async () => {
    await expect(
      controller.generateMonthEnd("scheduled-job-secret", {
        month: "2026-13",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(statements.generateMonthEndForAll).not.toHaveBeenCalled();
  });
});
