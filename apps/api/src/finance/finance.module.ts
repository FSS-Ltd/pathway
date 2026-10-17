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
import { FinanceBalanceService } from "./finance-balance.service";
import { FinanceReceiptController } from "./finance-receipt.controller";
import { FinanceReceiptService } from "./finance-receipt.service";
import { FinanceBankTransferController } from "./finance-bank-transfer.controller";
import { FinanceBankTransferService } from "./finance-bank-transfer.service";
import { FinanceManualReceiptController } from "./finance-manual-receipt.controller";
import { FinanceManualReceiptService } from "./finance-manual-receipt.service";

@Module({
  imports: [CommonModule, AuthModule, AccessControlModule, FinanceAccessModule],
  controllers: [
    FinanceInvoiceController,
    FinanceCreditNoteController,
    FinanceReceiptController,
    FinanceBankTransferController,
    FinanceManualReceiptController,
  ],
  providers: [
    FinanceBalanceService,
    FinanceCommandService,
    FinanceInvoiceService,
    FinanceCreditNoteService,
    FinanceReceiptService,
    FinanceBankTransferService,
    FinanceManualReceiptService,
  ],
})
export class FinanceModule {}
