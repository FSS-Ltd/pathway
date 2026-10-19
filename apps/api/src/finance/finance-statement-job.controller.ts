import {
  Body,
  Controller,
  Header,
  Headers,
  HttpCode,
  Inject,
  HttpStatus,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { financeStatementMonthEndJobSchema } from "./dto/finance-statement.dto";
import { parseFinanceInput } from "./finance-controller-support";
import { FinanceStatementService } from "./finance-statement.service";

@Controller("internal/finance/statements")
export class FinanceStatementJobController {
  constructor(
    @Inject(FinanceStatementService)
    private readonly statements: FinanceStatementService,
  ) {}

  @Post("month-end")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "private, no-store")
  async generateMonthEnd(
    @Headers("x-pathway-internal-secret") providedSecret: string | undefined,
    @Body() body: unknown,
  ) {
    if (
      !isValidSecret(
        providedSecret,
        process.env.FINANCE_STATEMENT_MONTH_END_SECRET,
      )
    ) {
      throw new UnauthorizedException("Invalid internal auth secret");
    }
    const { month } = parseFinanceInput(
      financeStatementMonthEndJobSchema,
      body,
    );
    return this.statements.generateMonthEndForAll(month);
  }
}

function isValidSecret(
  provided: string | undefined,
  expected: string | undefined,
): boolean {
  if (!provided || !expected) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
