import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access-control/access-control.module";
import { AuthModule } from "../auth/auth.module";
import { CommonModule } from "../common/common.module";
import { FinanceAccessModule } from "./access/finance-access.module";
import { FinanceCreditNoteController } from "./finance-credit-note.controller";
import { FinanceCreditNoteService } from "./finance-credit-note.service";
import { FinanceCommandService } from "./finance-command.service";
import { FinanceInvoiceController } from "./finance-invoice.controller";
import { FinanceInvoiceService } from "./finance-invoice.service";

@Module({
  imports: [CommonModule, AuthModule, AccessControlModule, FinanceAccessModule],
  controllers: [FinanceInvoiceController, FinanceCreditNoteController],
  providers: [
    FinanceCommandService,
    FinanceInvoiceService,
    FinanceCreditNoteService,
  ],
})
export class FinanceModule {}
