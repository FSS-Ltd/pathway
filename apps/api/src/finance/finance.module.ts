import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import {
  BILLING_PROVIDER_CONFIG,
  type BillingProviderConfig,
} from "../billing/billing-provider.config";
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
import { FinanceStripeConnectionController } from "./finance-stripe-connection.controller";
import {
  FINANCE_STRIPE_CONNECT_CONFIG,
  loadFinanceStripeConnectConfig,
} from "./stripe/finance-stripe-connect.config";
import {
  DisabledFinanceStripeConnectProvider,
  FINANCE_STRIPE_CONNECT_PROVIDER,
  StripeFinanceConnectProvider,
} from "./stripe/finance-stripe-connect.provider";
import { FinanceStripeConnectionService } from "./stripe/finance-stripe-connection.service";

@Module({
  imports: [
    BillingModule,
    CommonModule,
    AuthModule,
    AccessControlModule,
    FinanceAccessModule,
  ],
  controllers: [
    FinanceInvoiceController,
    FinanceCreditNoteController,
    FinanceReceiptController,
    FinanceBankTransferController,
    FinanceManualReceiptController,
    FinanceStripeConnectionController,
  ],
  providers: [
    FinanceBalanceService,
    FinanceCommandService,
    FinanceInvoiceService,
    FinanceCreditNoteService,
    FinanceReceiptService,
    FinanceBankTransferService,
    FinanceManualReceiptService,
    FinanceStripeConnectionService,
    {
      provide: FINANCE_STRIPE_CONNECT_CONFIG,
      useFactory: (billing: BillingProviderConfig) =>
        loadFinanceStripeConnectConfig(billing),
      inject: [BILLING_PROVIDER_CONFIG],
    },
    {
      provide: FINANCE_STRIPE_CONNECT_PROVIDER,
      useFactory: (
        config: ReturnType<typeof loadFinanceStripeConnectConfig>,
      ) =>
        config.mode === "disabled"
          ? new DisabledFinanceStripeConnectProvider()
          : new StripeFinanceConnectProvider(config),
      inject: [FINANCE_STRIPE_CONNECT_CONFIG],
    },
  ],
})
export class FinanceModule {}
