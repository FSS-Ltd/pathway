import { timingSafeEqual } from "node:crypto";
import {
  Body,
  Controller,
  Header,
  Headers,
  HttpCode,
  Inject,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { IndependentTransaction } from "../../common/database/independent-transaction.decorator";
import { parseFinanceInput } from "../finance-controller-support";
import { financeRecoveryRequestSchema } from "./finance-recovery.contracts";
import { FinanceRecoveryService } from "./finance-recovery.service";
import type { FinanceRecoveryResult } from "./finance-recovery-runtime";

@IndependentTransaction()
@Controller("internal/finance/reconciliation")
export class FinanceRecoveryInternalController {
  constructor(
    @Inject(FinanceRecoveryService)
    private readonly recovery: FinanceRecoveryService,
  ) {}

  @Post("run")
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store")
  async run(
    @Headers("x-pathway-internal-secret") secret: string | undefined,
    @Body() body: unknown,
  ): Promise<FinanceRecoveryResult> {
    const expected = process.env.INTERNAL_AUTH_SECRET;
    if (
      !expected ||
      !secret ||
      Buffer.byteLength(secret) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(secret), Buffer.from(expected))
    )
      throw new UnauthorizedException("Invalid internal auth secret");
    return this.recovery.run(
      parseFinanceInput(financeRecoveryRequestSchema, body),
    );
  }
}
