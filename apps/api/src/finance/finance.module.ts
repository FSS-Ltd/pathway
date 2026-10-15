import { Module } from "@nestjs/common";
import { FinanceAccessModule } from "./access/finance-access.module";
import { FinanceCreditNoteController } from "./finance-credit-note.controller";
import { FinanceCreditNoteService } from "./finance-credit-note.service";
import { FinanceCommandService } from "./finance-command.service";
import { FinanceInvoiceController } from "./finance-invoice.controller";
import { FinanceInvoiceService } from "./finance-invoice.service";

@Module({
  imports: [FinanceAccessModule],
  controllers: [FinanceInvoiceController, FinanceCreditNoteController],
  providers: [
    FinanceCommandService,
    FinanceInvoiceService,
    FinanceCreditNoteService,
  ],
})
export class FinanceModule {}
