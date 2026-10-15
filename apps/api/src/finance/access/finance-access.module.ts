import { Module } from "@nestjs/common";
import { AccessControlModule } from "../../access-control/access-control.module";
import { AuthModule } from "../../auth/auth.module";
import { CommonModule } from "../../common/common.module";
import {
  FINANCE_ACCESS_READER,
  financeAccessReader,
} from "./finance-access.reader";
import { FinanceAccessGuard } from "./finance-access.guard";
import { FinanceAccessService } from "./finance-access.service";
import { FinancePayerGrantController } from "./finance-payer-grant.controller";
import { FinancePayerGrantService } from "./finance-payer-grant.service";

@Module({
  imports: [CommonModule, AuthModule, AccessControlModule],
  controllers: [FinancePayerGrantController],
  providers: [
    FinanceAccessGuard,
    FinanceAccessService,
    FinancePayerGrantService,
    { provide: FINANCE_ACCESS_READER, useValue: financeAccessReader },
  ],
  exports: [FinanceAccessGuard, FinanceAccessService, FinancePayerGrantService],
})
export class FinanceAccessModule {}
