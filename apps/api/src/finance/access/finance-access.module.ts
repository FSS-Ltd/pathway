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

@Module({
  imports: [CommonModule, AuthModule, AccessControlModule],
  providers: [
    FinanceAccessGuard,
    FinanceAccessService,
    { provide: FINANCE_ACCESS_READER, useValue: financeAccessReader },
  ],
  exports: [FinanceAccessGuard, FinanceAccessService],
})
export class FinanceAccessModule {}
