import {
  Body,
  Controller,
  Inject,
  Headers,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { FinanceStatementNoticeService } from "./finance-statement-notice.service";

@Controller("internal/outbox/finance/statements")
export class FinanceStatementNoticeController {
  constructor(
    @Inject(FinanceStatementNoticeService)
    private readonly notices: FinanceStatementNoticeService,
  ) {}

  @Post("notice")
  dispatch(
    @Body() body: unknown,
    @Headers("x-pathway-internal-secret") providedSecret?: string,
  ) {
    const expected = process.env.FINANCE_STATEMENT_OUTBOX_SECRET;
    if (!isValidSecret(providedSecret, expected)) {
      throw new UnauthorizedException("Invalid internal auth secret");
    }
    return this.notices.dispatch(body);
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
