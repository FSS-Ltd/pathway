import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import {
  BILLING_PROVIDER_CONFIG,
  type BillingProviderConfig,
} from "../billing/billing-provider.config";
import { AccessControlModule } from "../access-control/access-control.module";
import { AuthModule } from "../auth/auth.module";
import { CommonModule } from "../common/common.module";
import { MailerModule } from "../mailer/mailer.module";
import { FinanceAccessModule } from "./access/finance-access.module";
import { FinancePayerGrantController } from "./access/finance-payer-grant.controller";
import { FinancePayerGrantService } from "./access/finance-payer-grant.service";
import { FinanceCreditNoteController } from "./finance-credit-note.controller";
import { FinanceCreditNoteService } from "./finance-credit-note.service";
import { FinanceCommandService } from "./finance-command.service";
import { FinanceInvoiceController } from "./finance-invoice.controller";
import { FinanceInvoiceService } from "./finance-invoice.service";
import { FinanceBalanceService } from "./finance-balance.service";
import { FinanceStatementController } from "./finance-statement.controller";
import { FinanceStatementService } from "./finance-statement.service";
import { FinanceStatementDocumentService } from "./finance-statement-document.service";
import { FinanceDocumentController } from "./finance-document.controller";
import { FinanceDocumentService } from "./finance-document.service";
import { FinanceStatementNoticeService } from "./finance-statement-notice.service";
import { FinanceStatementNoticeController } from "./finance-statement-notice.controller";
import { FinanceStatementJobController } from "./finance-statement-job.controller";
import { FinanceReceiptController } from "./finance-receipt.controller";
import { FinanceReceiptService } from "./finance-receipt.service";
import { FinanceRefundController } from "./finance-refund.controller";
import { FinanceRefundService } from "./finance-refund.service";
import { FinanceManualRefundReturnService } from "./finance-manual-refund-return.service";
import { FinanceBankTransferController } from "./finance-bank-transfer.controller";
import { FinanceBankTransferService } from "./finance-bank-transfer.service";
import { FinanceManualReceiptController } from "./finance-manual-receipt.controller";
import { FinanceManualReceiptService } from "./finance-manual-receipt.service";
import { FinanceProfileController } from "./finance-profile.controller";
import { FinanceProfileService } from "./finance-profile.service";
import { FinanceReportController } from "./finance-report.controller";
import { FinanceReportService } from "./finance-report.service";
import { FinanceReportRepository } from "./finance-report.repository";
import { FinanceSettlementReportRepository } from "./reconciliation/finance-settlement-report.repository";
import { FinanceReconciliationController } from "./finance-reconciliation.controller";
import { FinanceReconciliationService } from "./finance-reconciliation.service";
import { FinanceRecoveryInternalController } from "./reconciliation/finance-recovery-internal.controller";
import { FinanceRecoveryService } from "./reconciliation/finance-recovery.service";
import { FinanceReconciliationStateRepository } from "./reconciliation/finance-reconciliation-state.repository";
import { FinancePayerAccountController } from "./finance-payer-account.controller";
import { FinancePayerAccountService } from "./finance-payer-account.service";
import { FinanceFamilyController } from "./finance-family.controller";
import { FinanceFamilyService } from "./finance-family.service";
import { FinancePayerCheckoutStatusController } from "./finance-payer-checkout-status.controller";
import { FinanceStatementNameController } from "./finance-statement-name.controller";
import { FinanceStatementNameService } from "./stripe/finance-statement-name.service";
import {
  FINANCE_STATEMENT_NAME_READER,
  StripeFinanceStatementNameReader,
} from "./stripe/finance-statement-name-reader.provider";
import { FinanceStripeConnectionController } from "./finance-stripe-connection.controller";
import { FinanceStripeCheckoutController } from "./finance-stripe-checkout.controller";
import { FinanceBacsMandateController } from "./finance-bacs-mandate.controller";
import {
  FinanceCollectionPlanController,
  FinancePayerCollectionPlanController,
} from "./finance-collection-plan.controller";
import { FinanceStripeWebhookController } from "./stripe/finance-stripe-webhook.controller";
import { FinanceStripeWebhookInternalController } from "./stripe/finance-stripe-webhook-internal.controller";
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
import { FinanceStripeAccountSyncService } from "./stripe/finance-stripe-account-sync.service";
import {
  FINANCE_STRIPE_ACCOUNT_READER,
  StripeFinanceAccountReader,
} from "./stripe/finance-stripe-account-reader.provider";
import {
  FINANCE_STRIPE_SERVICING_CONFIG,
  loadFinanceStripeServicingConfig,
  type FinanceStripeServicingConfig,
} from "./stripe/finance-stripe-servicing.config";
import {
  DisabledFinanceStripeCheckoutProvider,
  FINANCE_STRIPE_CHECKOUT_PROVIDER,
  StripeFinanceCheckoutProvider,
} from "./stripe/finance-stripe-checkout.provider";
import {
  FINANCE_STRIPE_CHECKOUT_CONFIG,
  loadFinanceStripeCheckoutConfig,
} from "./stripe/finance-stripe-checkout.config";
import { FinanceStripeCheckoutAttemptService } from "./stripe/finance-stripe-checkout-attempt.service";
import { FinanceStripeCheckoutService } from "./stripe/finance-stripe-checkout.service";
import { FinanceStripeBacsMandateService } from "./stripe/finance-stripe-bacs-mandate.service";
import { FINANCE_STRIPE_MANDATE_SERVICING_PROVIDER } from "./stripe/finance-stripe-mandate-servicing.contracts";
import { StripeFinanceMandateServicingProvider } from "./stripe/finance-stripe-mandate-servicing.provider";
import { FinanceCollectionPlanService } from "./finance-collection-plan.service";
import { FinanceRecurringInvoiceController } from "./finance-recurring-invoice.controller";
import { FinanceRecurringInvoiceService } from "./finance-recurring-invoice.service";
import { FinanceBacsCollectionJobController } from "./finance-bacs-collection-job.controller";
import { FinanceBacsCollectionService } from "./finance-bacs-collection.service";
import {
  DisabledFinanceStripeBacsProvider,
  FINANCE_STRIPE_BACS_PROVIDER,
  StripeFinanceBacsProvider,
} from "./stripe/finance-stripe-bacs.provider";
import { FinanceStripeRefundSubmissionService } from "./stripe/finance-stripe-refund-submission.service";
import {
  DisabledFinanceStripeRefundProvider,
  FINANCE_STRIPE_REFUND_PROVIDER,
  StripeFinanceRefundProvider,
} from "./stripe/finance-stripe-refund.provider";
import { FinanceStripePaymentWebhookService } from "./stripe/finance-stripe-payment-webhook.service";
import { FinanceStripeBacsWebhookService } from "./stripe/finance-stripe-bacs-webhook.service";
import { FinanceStripeReversalWebhookService } from "./stripe/finance-stripe-reversal-webhook.service";
import {
  FINANCE_STRIPE_WEBHOOK_CONFIG,
  loadFinanceStripeWebhookConfig,
} from "./stripe/finance-stripe-webhook.config";
import {
  FinanceStripeWebhookReplayService,
  FinanceStripeWebhookService,
  PrismaFinanceStripeWebhookInbox,
} from "./stripe/finance-stripe-webhook.service";

@Module({
  imports: [
    BillingModule,
    CommonModule,
    MailerModule,
    AuthModule,
    AccessControlModule,
    FinanceAccessModule,
  ],
  controllers: [
    FinanceInvoiceController,
    FinanceCreditNoteController,
    FinanceReceiptController,
    FinanceRefundController,
    FinanceStatementController,
    FinanceDocumentController,
    FinanceStatementNoticeController,
    FinanceStatementJobController,
    FinanceBankTransferController,
    FinanceManualReceiptController,
    FinanceStripeConnectionController,
    FinanceStatementNameController,
    FinanceStripeCheckoutController,
    FinanceBacsMandateController,
    FinanceCollectionPlanController,
    FinancePayerCollectionPlanController,
    FinanceRecurringInvoiceController,
    FinanceBacsCollectionJobController,
    FinancePayerGrantController,
    FinanceStripeWebhookController,
    FinanceStripeWebhookInternalController,
    FinanceProfileController,
    FinanceReportController,
    FinanceReconciliationController,
    FinanceRecoveryInternalController,
    FinancePayerAccountController,
    FinanceFamilyController,
    FinancePayerCheckoutStatusController,
  ],
  providers: [
    FinanceBalanceService,
    FinanceReportService,
    FinanceReportRepository,
    FinanceSettlementReportRepository,
    FinanceReconciliationService,
    FinanceRecoveryService,
    FinanceReconciliationStateRepository,
    FinancePayerAccountService,
    FinanceFamilyService,
    FinanceStatementService,
    FinanceStatementDocumentService,
    FinanceDocumentService,
    FinanceStatementNoticeService,
    FinanceCommandService,
    FinanceInvoiceService,
    FinanceCreditNoteService,
    FinanceReceiptService,
    FinanceRefundService,
    FinanceManualRefundReturnService,
    FinanceStripeRefundSubmissionService,
    FinanceBankTransferService,
    FinanceManualReceiptService,
    FinanceProfileService,
    FinancePayerGrantService,
    FinanceStripeConnectionService,
    FinanceStatementNameService,
    {
      provide: FINANCE_STATEMENT_NAME_READER,
      useFactory: (config: FinanceStripeServicingConfig) =>
        new StripeFinanceStatementNameReader(config),
      inject: [FINANCE_STRIPE_SERVICING_CONFIG],
    },
    FinanceStripeAccountSyncService,
    FinanceStripeCheckoutAttemptService,
    FinanceStripeCheckoutService,
    FinanceStripeBacsMandateService,
    FinanceCollectionPlanService,
    FinanceRecurringInvoiceService,
    FinanceBacsCollectionService,
    FinanceStripePaymentWebhookService,
    FinanceStripeBacsWebhookService,
    FinanceStripeReversalWebhookService,
    PrismaFinanceStripeWebhookInbox,
    FinanceStripeWebhookService,
    FinanceStripeWebhookReplayService,
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
    {
      provide: FINANCE_STRIPE_SERVICING_CONFIG,
      useFactory: loadFinanceStripeServicingConfig,
      inject: [FINANCE_STRIPE_CONNECT_CONFIG],
    },
    {
      provide: FINANCE_STRIPE_ACCOUNT_READER,
      useFactory: (config: FinanceStripeServicingConfig) =>
        new StripeFinanceAccountReader(config),
      inject: [FINANCE_STRIPE_SERVICING_CONFIG],
    },
    {
      provide: FINANCE_STRIPE_CHECKOUT_CONFIG,
      useFactory: loadFinanceStripeCheckoutConfig,
      inject: [FINANCE_STRIPE_CONNECT_CONFIG],
    },
    {
      provide: FINANCE_STRIPE_CHECKOUT_PROVIDER,
      useFactory: (
        config: ReturnType<typeof loadFinanceStripeCheckoutConfig>,
      ) =>
        config.mode === "disabled"
          ? new DisabledFinanceStripeCheckoutProvider()
          : new StripeFinanceCheckoutProvider(config),
      inject: [FINANCE_STRIPE_CHECKOUT_CONFIG],
    },
    {
      provide: FINANCE_STRIPE_BACS_PROVIDER,
      useFactory: (
        config: ReturnType<typeof loadFinanceStripeCheckoutConfig>,
      ) =>
        config.mode === "disabled"
          ? new DisabledFinanceStripeBacsProvider()
          : new StripeFinanceBacsProvider(config),
      inject: [FINANCE_STRIPE_CHECKOUT_CONFIG],
    },
    {
      provide: FINANCE_STRIPE_REFUND_PROVIDER,
      useFactory: (config: FinanceStripeServicingConfig) =>
        config.mode === "disabled"
          ? new DisabledFinanceStripeRefundProvider()
          : new StripeFinanceRefundProvider(config),
      inject: [FINANCE_STRIPE_SERVICING_CONFIG],
    },
    {
      provide: FINANCE_STRIPE_MANDATE_SERVICING_PROVIDER,
      useFactory: (config: FinanceStripeServicingConfig) =>
        new StripeFinanceMandateServicingProvider(config),
      inject: [FINANCE_STRIPE_SERVICING_CONFIG],
    },
    {
      provide: FINANCE_STRIPE_WEBHOOK_CONFIG,
      useFactory: loadFinanceStripeWebhookConfig,
      inject: [FINANCE_STRIPE_SERVICING_CONFIG],
    },
  ],
})
export class FinanceModule {}
