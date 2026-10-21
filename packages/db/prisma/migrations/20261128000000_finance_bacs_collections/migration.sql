-- Add tenant-scoped Bacs mandates, installment collection and recurring invoices.
DO $$
DECLARE
  core_schema text;
BEGIN
  SELECT n.nspname INTO STRICT core_schema
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE c.relname = 'FinanceProfile'
    AND c.relkind IN ('r', 'p')
    AND n.nspname IN ('app', 'public');

  PERFORM pg_catalog.set_config(
    'search_path',
    pg_catalog.format('%I, %I', core_schema,
      CASE core_schema WHEN 'app' THEN 'public' ELSE 'app' END),
    false
  );
END;
$$;

-- CreateEnum
CREATE TYPE "FinanceMandateStatus" AS ENUM ('PENDING_SETUP', 'ACTIVE', 'CANCELLED', 'FAILED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "FinanceCollectionPlanStatus" AS ENUM ('PENDING_REVIEW', 'PENDING_PAYER_ACCEPTANCE', 'ACTIVE', 'PAUSED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "FinanceCollectionPlanEventType" AS ENUM ('CREATED', 'APPROVED', 'ACCEPTED', 'PAUSED', 'RESUMED', 'CANCELLED', 'DEBIT_SUBMITTED', 'DEBIT_PROCESSING', 'DEBIT_SUCCEEDED', 'DEBIT_FAILED', 'MANUAL_PAYMENT_COVERED', 'REVIEW_REQUIRED');

-- CreateEnum
CREATE TYPE "FinanceCollectionInstalmentStatus" AS ENUM ('SCHEDULED', 'SUBMISSION_PENDING', 'PROCESSING', 'PAID', 'COVERED', 'FAILED', 'PAUSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FinanceDebitAttemptStatus" AS ENUM ('CREATING', 'SUBMITTED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "FinanceRecurringInvoiceTemplateStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELLED');

-- AlterTable
ALTER TABLE "FinanceInvoice" ADD COLUMN     "recurringPeriodStart" DATE,
ADD COLUMN     "recurringTemplateId" TEXT;

-- CreateTable
CREATE TABLE "FinanceStripeCustomer" (
    "id" TEXT NOT NULL,
    "financeProfileId" TEXT NOT NULL,
    "stripeConnectionId" TEXT NOT NULL,
    "payerAccountId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "stripeAccountId" VARCHAR(255) NOT NULL,
    "stripeCustomerId" VARCHAR(255) NOT NULL,
    "livemode" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceStripeCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceMandate" (
    "id" TEXT NOT NULL,
    "financeProfileId" TEXT NOT NULL,
    "stripeConnectionId" TEXT NOT NULL,
    "payerAccountId" TEXT NOT NULL,
    "financeStripeCustomerId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "stripeAccountId" VARCHAR(255) NOT NULL,
    "livemode" BOOLEAN NOT NULL,
    "stripeCheckoutSessionId" VARCHAR(255),
    "checkoutUrl" TEXT,
    "setupExpiresAt" TIMESTAMP(3),
    "stripeSetupIntentId" VARCHAR(255),
    "stripePaymentMethodId" VARCHAR(255),
    "stripeMandateId" VARCHAR(255),
    "status" "FinanceMandateStatus" NOT NULL DEFAULT 'PENDING_SETUP',
    "consentVersion" VARCHAR(64) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedByUserId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "providerCancellationPending" BOOLEAN NOT NULL DEFAULT false,
    "providerStatusAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceMandate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceCollectionPlan" (
    "id" TEXT NOT NULL,
    "financeProfileId" TEXT NOT NULL,
    "stripeConnectionId" TEXT NOT NULL,
    "payerAccountId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "mandateId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "FinanceCollectionPlanStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "amountMinor" BIGINT NOT NULL,
    "currency" "FinanceCurrency" NOT NULL DEFAULT 'GBP',
    "instalmentCount" INTEGER NOT NULL,
    "firstDueAt" TIMESTAMP(3) NOT NULL,
    "dayOfMonth" INTEGER NOT NULL,
    "consentVersion" VARCHAR(64) NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "acceptedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceCollectionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceCollectionPlanEvent" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "stripeEventId" VARCHAR(255),
    "type" "FinanceCollectionPlanEventType" NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceCollectionPlanEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceCollectionInstalment" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "dueAt" DATE NOT NULL,
    "status" "FinanceCollectionInstalmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceCollectionInstalment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceDebitAttempt" (
    "id" TEXT NOT NULL,
    "instalmentId" TEXT NOT NULL,
    "stripeConnectionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "stripeAccountId" VARCHAR(255) NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" "FinanceCurrency" NOT NULL DEFAULT 'GBP',
    "status" "FinanceDebitAttemptStatus" NOT NULL DEFAULT 'CREATING',
    "idempotencyKey" VARCHAR(255) NOT NULL,
    "stripePaymentIntentId" VARCHAR(255),
    "submittedAt" TIMESTAMP(3),
    "providerStatusAt" TIMESTAMP(3),
    "statusUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceDebitAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceRecurringInvoiceTemplate" (
    "id" TEXT NOT NULL,
    "financeProfileId" TEXT NOT NULL,
    "payerAccountId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "currency" "FinanceCurrency" NOT NULL DEFAULT 'GBP',
    "status" "FinanceRecurringInvoiceTemplateStatus" NOT NULL DEFAULT 'ACTIVE',
    "dayOfMonth" INTEGER NOT NULL,
    "dueDays" INTEGER NOT NULL DEFAULT 14,
    "nextPeriodStart" DATE NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceRecurringInvoiceTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceRecurringInvoiceTemplateLine" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "lineOrder" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitAmountMinor" BIGINT NOT NULL,
    "taxRateBasisPoints" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceRecurringInvoiceTemplateLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinanceStripeCustomer_tenantId_orgId_payerAccountId_idx" ON "FinanceStripeCustomer"("tenantId", "orgId", "payerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceStripeCustomer_id_payerAccountId_tenantId_orgId_key" ON "FinanceStripeCustomer"("id", "payerAccountId", "tenantId", "orgId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceStripeCustomer_stripeAccountId_stripeCustomerId_key" ON "FinanceStripeCustomer"("stripeAccountId", "stripeCustomerId");

-- CreateIndex
CREATE INDEX "FinanceMandate_tenantId_orgId_payerAccountId_status_created_idx" ON "FinanceMandate"("tenantId", "orgId", "payerAccountId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceMandate_id_tenantId_orgId_key" ON "FinanceMandate"("id", "tenantId", "orgId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceMandate_stripeAccountId_stripeMandateId_key" ON "FinanceMandate"("stripeAccountId", "stripeMandateId");

CREATE UNIQUE INDEX "FinanceMandate_stripeAccountId_stripeCheckoutSessionId_key" ON "FinanceMandate"("stripeAccountId", "stripeCheckoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceMandate_stripeAccountId_stripeSetupIntentId_key" ON "FinanceMandate"("stripeAccountId", "stripeSetupIntentId");

-- CreateIndex
CREATE INDEX "FinanceCollectionPlan_tenantId_orgId_invoiceId_status_versi_idx" ON "FinanceCollectionPlan"("tenantId", "orgId", "invoiceId", "status", "version");

-- CreateIndex
CREATE INDEX "FinanceCollectionPlan_tenantId_orgId_payerAccountId_status_idx" ON "FinanceCollectionPlan"("tenantId", "orgId", "payerAccountId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCollectionPlan_id_tenantId_orgId_key" ON "FinanceCollectionPlan"("id", "tenantId", "orgId");

-- CreateIndex
CREATE INDEX "FinanceCollectionPlanEvent_tenantId_orgId_planId_createdAt_idx" ON "FinanceCollectionPlanEvent"("tenantId", "orgId", "planId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCollectionPlanEvent_id_tenantId_orgId_key" ON "FinanceCollectionPlanEvent"("id", "tenantId", "orgId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCollectionPlanEvent_stripeEventId_planId_key" ON "FinanceCollectionPlanEvent"("stripeEventId", "planId");

-- CreateIndex
CREATE INDEX "FinanceCollectionInstalment_tenantId_orgId_status_dueAt_idx" ON "FinanceCollectionInstalment"("tenantId", "orgId", "status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCollectionInstalment_id_tenantId_orgId_key" ON "FinanceCollectionInstalment"("id", "tenantId", "orgId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCollectionInstalment_planId_sequence_key" ON "FinanceCollectionInstalment"("planId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceDebitAttempt_idempotencyKey_key" ON "FinanceDebitAttempt"("idempotencyKey");

-- CreateIndex
CREATE INDEX "FinanceDebitAttempt_tenantId_orgId_status_createdAt_idx" ON "FinanceDebitAttempt"("tenantId", "orgId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceDebitAttempt_id_tenantId_orgId_key" ON "FinanceDebitAttempt"("id", "tenantId", "orgId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceDebitAttempt_stripeAccountId_stripePaymentIntentId_key" ON "FinanceDebitAttempt"("stripeAccountId", "stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "FinanceRecurringInvoiceTemplate_tenantId_orgId_status_nextP_idx" ON "FinanceRecurringInvoiceTemplate"("tenantId", "orgId", "status", "nextPeriodStart");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceRecurringInvoiceTemplate_id_tenantId_orgId_key" ON "FinanceRecurringInvoiceTemplate"("id", "tenantId", "orgId");

-- CreateIndex
CREATE INDEX "FinanceRecurringInvoiceTemplateLine_tenantId_orgId_template_idx" ON "FinanceRecurringInvoiceTemplateLine"("tenantId", "orgId", "templateId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceRecurringInvoiceTemplateLine_templateId_lineOrder_key" ON "FinanceRecurringInvoiceTemplateLine"("templateId", "lineOrder");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceRecurringInvoiceTemplateLine_id_tenantId_orgId_key" ON "FinanceRecurringInvoiceTemplateLine"("id", "tenantId", "orgId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceInvoice_recurringTemplateId_recurringPeriodStart_key" ON "FinanceInvoice"("recurringTemplateId", "recurringPeriodStart");

-- AddForeignKey
ALTER TABLE "FinanceStripeCustomer" ADD CONSTRAINT "FinanceStripeCustomer_financeProfileId_tenantId_orgId_fkey" FOREIGN KEY ("financeProfileId", "tenantId", "orgId") REFERENCES "FinanceProfile"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceStripeCustomer" ADD CONSTRAINT "FinanceStripeCustomer_stripeConnectionId_tenantId_orgId_fkey" FOREIGN KEY ("stripeConnectionId", "tenantId", "orgId") REFERENCES "FinanceStripeConnection"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceStripeCustomer" ADD CONSTRAINT "FinanceStripeCustomer_payerAccountId_tenantId_orgId_fkey" FOREIGN KEY ("payerAccountId", "tenantId", "orgId") REFERENCES "FinancePayerAccount"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceStripeCustomer" ADD CONSTRAINT "FinanceStripeCustomer_tenantId_orgId_fkey" FOREIGN KEY ("tenantId", "orgId") REFERENCES "Tenant"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceStripeCustomer" ADD CONSTRAINT "FinanceStripeCustomer_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceMandate" ADD CONSTRAINT "FinanceMandate_financeProfileId_tenantId_orgId_fkey" FOREIGN KEY ("financeProfileId", "tenantId", "orgId") REFERENCES "FinanceProfile"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceMandate" ADD CONSTRAINT "FinanceMandate_stripeConnectionId_tenantId_orgId_fkey" FOREIGN KEY ("stripeConnectionId", "tenantId", "orgId") REFERENCES "FinanceStripeConnection"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceMandate" ADD CONSTRAINT "FinanceMandate_payerAccountId_tenantId_orgId_fkey" FOREIGN KEY ("payerAccountId", "tenantId", "orgId") REFERENCES "FinancePayerAccount"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceMandate" ADD CONSTRAINT "FinanceMandate_financeStripeCustomerId_payerAccountId_tena_fkey" FOREIGN KEY ("financeStripeCustomerId", "payerAccountId", "tenantId", "orgId") REFERENCES "FinanceStripeCustomer"("id", "payerAccountId", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceMandate" ADD CONSTRAINT "FinanceMandate_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceMandate" ADD CONSTRAINT "FinanceMandate_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceMandate" ADD CONSTRAINT "FinanceMandate_tenantId_orgId_fkey" FOREIGN KEY ("tenantId", "orgId") REFERENCES "Tenant"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceMandate" ADD CONSTRAINT "FinanceMandate_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCollectionPlan" ADD CONSTRAINT "FinanceCollectionPlan_financeProfileId_tenantId_orgId_fkey" FOREIGN KEY ("financeProfileId", "tenantId", "orgId") REFERENCES "FinanceProfile"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCollectionPlan" ADD CONSTRAINT "FinanceCollectionPlan_stripeConnectionId_tenantId_orgId_fkey" FOREIGN KEY ("stripeConnectionId", "tenantId", "orgId") REFERENCES "FinanceStripeConnection"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCollectionPlan" ADD CONSTRAINT "FinanceCollectionPlan_payerAccountId_tenantId_orgId_fkey" FOREIGN KEY ("payerAccountId", "tenantId", "orgId") REFERENCES "FinancePayerAccount"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCollectionPlan" ADD CONSTRAINT "FinanceCollectionPlan_invoiceId_tenantId_orgId_fkey" FOREIGN KEY ("invoiceId", "tenantId", "orgId") REFERENCES "FinanceInvoice"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCollectionPlan" ADD CONSTRAINT "FinanceCollectionPlan_mandateId_tenantId_orgId_fkey" FOREIGN KEY ("mandateId", "tenantId", "orgId") REFERENCES "FinanceMandate"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCollectionPlan" ADD CONSTRAINT "FinanceCollectionPlan_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCollectionPlan" ADD CONSTRAINT "FinanceCollectionPlan_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCollectionPlan" ADD CONSTRAINT "FinanceCollectionPlan_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCollectionPlan" ADD CONSTRAINT "FinanceCollectionPlan_tenantId_orgId_fkey" FOREIGN KEY ("tenantId", "orgId") REFERENCES "Tenant"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCollectionPlan" ADD CONSTRAINT "FinanceCollectionPlan_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCollectionPlanEvent" ADD CONSTRAINT "FinanceCollectionPlanEvent_planId_tenantId_orgId_fkey" FOREIGN KEY ("planId", "tenantId", "orgId") REFERENCES "FinanceCollectionPlan"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCollectionPlanEvent" ADD CONSTRAINT "FinanceCollectionPlanEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCollectionPlanEvent" ADD CONSTRAINT "FinanceCollectionPlanEvent_tenantId_orgId_fkey" FOREIGN KEY ("tenantId", "orgId") REFERENCES "Tenant"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCollectionPlanEvent" ADD CONSTRAINT "FinanceCollectionPlanEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCollectionInstalment" ADD CONSTRAINT "FinanceCollectionInstalment_planId_tenantId_orgId_fkey" FOREIGN KEY ("planId", "tenantId", "orgId") REFERENCES "FinanceCollectionPlan"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCollectionInstalment" ADD CONSTRAINT "FinanceCollectionInstalment_tenantId_orgId_fkey" FOREIGN KEY ("tenantId", "orgId") REFERENCES "Tenant"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCollectionInstalment" ADD CONSTRAINT "FinanceCollectionInstalment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceDebitAttempt" ADD CONSTRAINT "FinanceDebitAttempt_instalmentId_tenantId_orgId_fkey" FOREIGN KEY ("instalmentId", "tenantId", "orgId") REFERENCES "FinanceCollectionInstalment"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceDebitAttempt" ADD CONSTRAINT "FinanceDebitAttempt_stripeConnectionId_tenantId_orgId_fkey" FOREIGN KEY ("stripeConnectionId", "tenantId", "orgId") REFERENCES "FinanceStripeConnection"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceDebitAttempt" ADD CONSTRAINT "FinanceDebitAttempt_tenantId_orgId_fkey" FOREIGN KEY ("tenantId", "orgId") REFERENCES "Tenant"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceDebitAttempt" ADD CONSTRAINT "FinanceDebitAttempt_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceRecurringInvoiceTemplate" ADD CONSTRAINT "FinanceRecurringInvoiceTemplate_financeProfileId_tenantId__fkey" FOREIGN KEY ("financeProfileId", "tenantId", "orgId") REFERENCES "FinanceProfile"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceRecurringInvoiceTemplate" ADD CONSTRAINT "FinanceRecurringInvoiceTemplate_payerAccountId_tenantId_or_fkey" FOREIGN KEY ("payerAccountId", "tenantId", "orgId") REFERENCES "FinancePayerAccount"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceRecurringInvoiceTemplate" ADD CONSTRAINT "FinanceRecurringInvoiceTemplate_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceRecurringInvoiceTemplate" ADD CONSTRAINT "FinanceRecurringInvoiceTemplate_tenantId_orgId_fkey" FOREIGN KEY ("tenantId", "orgId") REFERENCES "Tenant"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceRecurringInvoiceTemplate" ADD CONSTRAINT "FinanceRecurringInvoiceTemplate_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceRecurringInvoiceTemplateLine" ADD CONSTRAINT "FinanceRecurringInvoiceTemplateLine_templateId_tenantId_or_fkey" FOREIGN KEY ("templateId", "tenantId", "orgId") REFERENCES "FinanceRecurringInvoiceTemplate"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceRecurringInvoiceTemplateLine" ADD CONSTRAINT "FinanceRecurringInvoiceTemplateLine_tenantId_orgId_fkey" FOREIGN KEY ("tenantId", "orgId") REFERENCES "Tenant"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceRecurringInvoiceTemplateLine" ADD CONSTRAINT "FinanceRecurringInvoiceTemplateLine_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceInvoice" ADD CONSTRAINT "FinanceInvoice_recurringTemplateId_tenantId_orgId_fkey" FOREIGN KEY ("recurringTemplateId", "tenantId", "orgId") REFERENCES "FinanceRecurringInvoiceTemplate"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinanceInvoice"
  ADD CONSTRAINT "FinanceInvoice_recurring_period_shape" CHECK (
    ("recurringTemplateId" IS NULL AND "recurringPeriodStart" IS NULL)
    OR ("recurringTemplateId" IS NOT NULL AND "recurringPeriodStart" IS NOT NULL)
  );
ALTER TABLE "FinanceStripeCustomer"
  ADD CONSTRAINT "FinanceStripeCustomer_identifiers_nonempty" CHECK (
    length(btrim("stripeAccountId")) > 0 AND length(btrim("stripeCustomerId")) > 0
  );
ALTER TABLE "FinanceMandate"
  ADD CONSTRAINT "FinanceMandate_provider_shape" CHECK (
    ("status" = 'PENDING_SETUP' AND "stripeSetupIntentId" IS NULL AND "stripePaymentMethodId" IS NULL AND "acceptedAt" IS NULL)
    OR ("status" = 'ACTIVE' AND "stripeSetupIntentId" IS NOT NULL AND "stripePaymentMethodId" IS NOT NULL
      AND "stripeMandateId" IS NOT NULL AND "acceptedAt" IS NOT NULL AND "acceptedByUserId" IS NOT NULL)
    OR ("status" IN ('CANCELLED', 'FAILED', 'UNKNOWN'))
  );
ALTER TABLE "FinanceCollectionPlan"
  ADD CONSTRAINT "FinanceCollectionPlan_amount_positive" CHECK ("amountMinor" > 0),
  ADD CONSTRAINT "FinanceCollectionPlan_instalment_count_valid" CHECK ("instalmentCount" BETWEEN 1 AND 12),
  ADD CONSTRAINT "FinanceCollectionPlan_day_valid" CHECK ("dayOfMonth" BETWEEN 1 AND 31),
  ADD CONSTRAINT "FinanceCollectionPlan_approval_shape" CHECK (
    ("status" = 'PENDING_REVIEW' AND "approvedByUserId" IS NULL AND "approvedAt" IS NULL)
    OR "status" = 'CANCELLED'
    OR ("status" NOT IN ('PENDING_REVIEW', 'CANCELLED') AND "approvedByUserId" IS NOT NULL AND "approvedAt" IS NOT NULL)
  ),
  ADD CONSTRAINT "FinanceCollectionPlan_acceptance_shape" CHECK (
    ("status" IN ('PENDING_REVIEW', 'PENDING_PAYER_ACCEPTANCE') AND "acceptedByUserId" IS NULL AND "acceptedAt" IS NULL)
    OR ("status" IN ('ACTIVE', 'PAUSED', 'COMPLETED')
      AND "acceptedByUserId" IS NOT NULL AND "acceptedAt" IS NOT NULL)
    OR ("status" = 'CANCELLED' AND (("acceptedByUserId" IS NULL AND "acceptedAt" IS NULL)
      OR ("acceptedByUserId" IS NOT NULL AND "acceptedAt" IS NOT NULL)))
  );
ALTER TABLE "FinanceCollectionInstalment"
  ADD CONSTRAINT "FinanceCollectionInstalment_sequence_positive" CHECK ("sequence" BETWEEN 1 AND 12),
  ADD CONSTRAINT "FinanceCollectionInstalment_amount_positive" CHECK ("amountMinor" > 0),
  ADD CONSTRAINT "FinanceCollectionInstalment_paid_shape" CHECK (("status" = 'PAID') = ("paidAt" IS NOT NULL));
ALTER TABLE "FinanceDebitAttempt"
  ADD CONSTRAINT "FinanceDebitAttempt_amount_positive" CHECK ("amountMinor" > 0),
  ADD CONSTRAINT "FinanceDebitAttempt_gbp_only" CHECK ("currency" = 'GBP'),
  ADD CONSTRAINT "FinanceDebitAttempt_submission_shape" CHECK (
    "status" NOT IN ('SUBMITTED', 'PROCESSING', 'SUCCEEDED', 'FAILED') OR "submittedAt" IS NOT NULL
  ),
  ADD CONSTRAINT "FinanceDebitAttempt_identifiers_nonempty" CHECK (
    length(btrim("stripeAccountId")) > 0 AND length(btrim("idempotencyKey")) > 0
  );
ALTER TABLE "FinanceRecurringInvoiceTemplate"
  ADD CONSTRAINT "FinanceRecurringInvoiceTemplate_day_valid" CHECK ("dayOfMonth" BETWEEN 1 AND 31),
  ADD CONSTRAINT "FinanceRecurringInvoiceTemplate_due_days_valid" CHECK ("dueDays" BETWEEN 1 AND 90);
ALTER TABLE "FinanceRecurringInvoiceTemplateLine"
  ADD CONSTRAINT "FinanceRecurringInvoiceTemplateLine_values_valid" CHECK (
    "lineOrder" >= 0 AND length(btrim("description")) > 0 AND "quantity" > 0
    AND "unitAmountMinor" >= 0 AND "taxRateBasisPoints" BETWEEN 0 AND 100000
  );

CREATE UNIQUE INDEX "FinanceStripeCustomer_one_per_connected_payer_key"
  ON "FinanceStripeCustomer"("stripeConnectionId", "payerAccountId", "tenantId", "orgId");
CREATE UNIQUE INDEX "FinanceMandate_one_open_per_payer_key"
  ON "FinanceMandate"("payerAccountId", "tenantId", "orgId")
  WHERE "status" IN ('PENDING_SETUP', 'ACTIVE', 'UNKNOWN');
CREATE UNIQUE INDEX "FinanceCollectionPlan_one_live_invoice_key"
  ON "FinanceCollectionPlan"("invoiceId", "tenantId", "orgId")
  WHERE "status" IN ('PENDING_REVIEW', 'PENDING_PAYER_ACCEPTANCE', 'ACTIVE', 'PAUSED');
CREATE UNIQUE INDEX "FinanceDebitAttempt_one_unresolved_instalment_key"
  ON "FinanceDebitAttempt"("instalmentId", "tenantId", "orgId")
  WHERE "status" IN ('CREATING', 'SUBMITTED', 'PROCESSING', 'UNKNOWN');

DO $$
DECLARE
  core_schema text;
BEGIN
  SELECT n.nspname INTO STRICT core_schema
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE c.relname = 'FinanceProfile'
    AND c.relkind IN ('r', 'p')
    AND n.nspname IN ('app', 'public');

  EXECUTE format($function$
    CREATE FUNCTION app.list_due_finance_collection_scopes(p_as_of timestamptz)
    RETURNS TABLE("tenantId" text, "orgId" text)
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = ''
    AS $body$
      SELECT DISTINCT plan."tenantId", plan."orgId"
      FROM %1$I."FinanceCollectionPlan" AS plan
      JOIN %1$I."FinanceCollectionInstalment" AS instalment
        ON instalment."planId" = plan."id"
        AND instalment."tenantId" = plan."tenantId"
        AND instalment."orgId" = plan."orgId"
      WHERE plan."status" = 'ACTIVE'
        AND instalment."status" IN ('SCHEDULED', 'SUBMISSION_PENDING')
        AND instalment."dueAt" <= ((p_as_of AT TIME ZONE 'Europe/London')::date)
      UNION
      SELECT DISTINCT template."tenantId", template."orgId"
      FROM %1$I."FinanceRecurringInvoiceTemplate" AS template
      WHERE template."status" = 'ACTIVE'
        AND template."nextPeriodStart" <= date_trunc('month',
          p_as_of AT TIME ZONE 'Europe/London')::date
        AND make_date(
          extract(year FROM template."nextPeriodStart")::integer,
          extract(month FROM template."nextPeriodStart")::integer,
          LEAST(
            template."dayOfMonth",
            extract(day FROM (
              date_trunc('month', template."nextPeriodStart") + interval '1 month - 1 day'
            ))::integer
          )
        ) <= ((p_as_of AT TIME ZONE 'Europe/London')::date)
    $body$
  $function$, core_schema);
  EXECUTE 'REVOKE ALL ON FUNCTION app.list_due_finance_collection_scopes(timestamptz) FROM PUBLIC';
  EXECUTE 'GRANT EXECUTE ON FUNCTION app.list_due_finance_collection_scopes(timestamptz) TO CURRENT_USER';
END;
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'FinanceStripeCustomer', 'FinanceMandate', 'FinanceCollectionPlan',
    'FinanceCollectionPlanEvent', 'FinanceCollectionInstalment', 'FinanceDebitAttempt',
    'FinanceRecurringInvoiceTemplate', 'FinanceRecurringInvoiceTemplateLine'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (app.current_tenant_id() IS NOT NULL AND app.current_org_id() IS NOT NULL AND "tenantId" = app.current_tenant_id() AND "orgId" = app.current_org_id()) WITH CHECK (app.current_tenant_id() IS NOT NULL AND app.current_org_id() IS NOT NULL AND "tenantId" = app.current_tenant_id() AND "orgId" = app.current_org_id())',
      table_name || '_tenant_org_rls', table_name
    );
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM PUBLIC', table_name);
    IF to_regrole('anon') IS NOT NULL THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM anon', table_name);
    END IF;
    IF to_regrole('authenticated') IS NOT NULL THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM authenticated', table_name);
    END IF;
  END LOOP;
END;
$$;

DO $$
DECLARE
  core_schema text;
BEGIN
  SELECT n.nspname INTO STRICT core_schema
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE c.relname = 'FinanceCollectionPlan'
    AND c.relkind IN ('r', 'p')
    AND n.nspname IN ('app', 'public');

  EXECUTE format($function$
    CREATE FUNCTION %1$I.finance_collection_plan_scope_guard()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = ''
    AS $body$
    DECLARE
      invoice_record record;
      connection_record record;
      mandate_record record;
    BEGIN
      IF TG_OP = 'UPDATE' THEN
        IF OLD."financeProfileId" IS DISTINCT FROM NEW."financeProfileId"
          OR OLD."stripeConnectionId" IS DISTINCT FROM NEW."stripeConnectionId"
          OR OLD."payerAccountId" IS DISTINCT FROM NEW."payerAccountId"
          OR OLD."invoiceId" IS DISTINCT FROM NEW."invoiceId"
          OR OLD."mandateId" IS DISTINCT FROM NEW."mandateId"
          OR OLD."version" IS DISTINCT FROM NEW."version"
          OR OLD."amountMinor" IS DISTINCT FROM NEW."amountMinor"
          OR OLD."currency" IS DISTINCT FROM NEW."currency"
          OR OLD."instalmentCount" IS DISTINCT FROM NEW."instalmentCount"
          OR OLD."firstDueAt" IS DISTINCT FROM NEW."firstDueAt"
          OR OLD."dayOfMonth" IS DISTINCT FROM NEW."dayOfMonth"
          OR OLD."consentVersion" IS DISTINCT FROM NEW."consentVersion"
          OR OLD."createdByUserId" IS DISTINCT FROM NEW."createdByUserId"
          OR OLD."tenantId" IS DISTINCT FROM NEW."tenantId"
          OR OLD."orgId" IS DISTINCT FROM NEW."orgId" THEN
          RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'FinanceCollectionPlan_financial_terms_immutable',
            MESSAGE = 'Finance collection plan financial terms are immutable';
        END IF;
        IF (OLD."acceptedByUserId" IS DISTINCT FROM NEW."acceptedByUserId"
          OR OLD."acceptedAt" IS DISTINCT FROM NEW."acceptedAt")
          AND NOT (
            OLD."acceptedByUserId" IS NULL
            AND OLD."acceptedAt" IS NULL
            AND NEW."acceptedByUserId" IS NOT NULL
            AND NEW."acceptedAt" IS NOT NULL
            AND OLD."status" = 'PENDING_PAYER_ACCEPTANCE'
            AND NEW."status" = 'ACTIVE'
          ) THEN
          RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'FinanceCollectionPlan_acceptance_immutable',
            MESSAGE = 'Finance collection plan acceptance cannot be changed';
        END IF;
        RETURN NEW;
      END IF;

      SELECT "financeProfileId", "payerAccountId", "status", "currency", "totalMinor"
        INTO invoice_record
        FROM %1$I."FinanceInvoice"
        WHERE "id" = NEW."invoiceId" AND "tenantId" = NEW."tenantId" AND "orgId" = NEW."orgId";
      SELECT "stripeAccountId", "livemode", "status", "financeProfileId"
        INTO connection_record
        FROM %1$I."FinanceStripeConnection"
        WHERE "id" = NEW."stripeConnectionId" AND "tenantId" = NEW."tenantId" AND "orgId" = NEW."orgId";
      SELECT "payerAccountId", "stripeConnectionId", "stripeAccountId", "livemode", "status", "acceptedAt"
        INTO mandate_record
        FROM %1$I."FinanceMandate"
        WHERE "id" = NEW."mandateId" AND "tenantId" = NEW."tenantId" AND "orgId" = NEW."orgId";

      IF invoice_record."status" <> 'ISSUED'
        OR invoice_record."payerAccountId" <> NEW."payerAccountId"
        OR invoice_record."financeProfileId" <> NEW."financeProfileId"
        OR invoice_record."currency" <> 'GBP'
        OR invoice_record."totalMinor" <> NEW."amountMinor"
        OR NEW."currency" <> 'GBP'
        OR connection_record."status" <> 'READY'
        OR connection_record."financeProfileId" <> NEW."financeProfileId"
        OR connection_record."stripeAccountId" IS NULL
        OR connection_record."livemode" <> mandate_record."livemode"
        OR mandate_record."payerAccountId" <> NEW."payerAccountId"
        OR mandate_record."stripeConnectionId" <> NEW."stripeConnectionId"
        OR mandate_record."stripeAccountId" <> connection_record."stripeAccountId"
        OR mandate_record."status" <> 'ACTIVE'
        OR mandate_record."acceptedAt" IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'FinanceCollectionPlan_scope_invalid',
          MESSAGE = 'Finance collection plan scope or source state is invalid';
      END IF;
      RETURN NEW;
    END;
    $body$
  $function$, core_schema);
  EXECUTE format(
    'CREATE TRIGGER "FinanceCollectionPlan_scope_guard" BEFORE INSERT OR UPDATE ON %1$I."FinanceCollectionPlan" FOR EACH ROW EXECUTE FUNCTION %1$I.finance_collection_plan_scope_guard()',
    core_schema
  );
END;
$$;

DO $$
DECLARE
  core_schema text;
BEGIN
  SELECT n.nspname INTO STRICT core_schema
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE c.relname = 'FinanceDebitAttempt'
    AND c.relkind IN ('r', 'p')
    AND n.nspname IN ('app', 'public');

  EXECUTE format($function$
    CREATE FUNCTION %1$I.finance_debit_attempt_scope_guard()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = ''
    AS $body$
    DECLARE
      instalment_record record;
      plan_record record;
      connection_record record;
    BEGIN
      IF TG_OP = 'UPDATE' THEN
        IF OLD."instalmentId" IS DISTINCT FROM NEW."instalmentId"
          OR OLD."stripeConnectionId" IS DISTINCT FROM NEW."stripeConnectionId"
          OR OLD."stripeAccountId" IS DISTINCT FROM NEW."stripeAccountId"
          OR OLD."amountMinor" IS DISTINCT FROM NEW."amountMinor"
          OR OLD."currency" IS DISTINCT FROM NEW."currency"
          OR OLD."idempotencyKey" IS DISTINCT FROM NEW."idempotencyKey"
          OR OLD."tenantId" IS DISTINCT FROM NEW."tenantId"
          OR OLD."orgId" IS DISTINCT FROM NEW."orgId" THEN
          RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'FinanceDebitAttempt_financial_terms_immutable',
            MESSAGE = 'Finance debit attempt financial terms are immutable';
        END IF;
        RETURN NEW;
      END IF;

      SELECT instalment."amountMinor", plan."stripeConnectionId", plan."financeProfileId",
        plan."status" AS plan_status, plan."currency"
        INTO instalment_record
        FROM %1$I."FinanceCollectionInstalment" AS instalment
        JOIN %1$I."FinanceCollectionPlan" AS plan
          ON plan."id" = instalment."planId"
          AND plan."tenantId" = instalment."tenantId"
          AND plan."orgId" = instalment."orgId"
        WHERE instalment."id" = NEW."instalmentId"
          AND instalment."tenantId" = NEW."tenantId"
          AND instalment."orgId" = NEW."orgId";
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'FinanceDebitAttempt_instalment_scope_invalid',
          MESSAGE = 'Finance debit attempt instalment is outside its tenant scope';
      END IF;

      SELECT "stripeAccountId", "financeProfileId", "status", "livemode"
        INTO connection_record
        FROM %1$I."FinanceStripeConnection"
        WHERE "id" = NEW."stripeConnectionId"
          AND "tenantId" = NEW."tenantId"
          AND "orgId" = NEW."orgId";
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'FinanceDebitAttempt_connection_scope_invalid',
          MESSAGE = 'Finance debit attempt connection is outside its tenant scope';
      END IF;

      SELECT "countryCode", "currency"
        INTO plan_record
        FROM %1$I."FinanceProfile"
        WHERE "id" = instalment_record."financeProfileId"
          AND "tenantId" = NEW."tenantId"
          AND "orgId" = NEW."orgId";
      IF NOT FOUND
        OR instalment_record."stripeConnectionId" <> NEW."stripeConnectionId"
        OR instalment_record.plan_status <> 'ACTIVE'
        OR instalment_record."currency" <> 'GBP'
        OR connection_record."status" <> 'READY'
        OR connection_record."financeProfileId" <> instalment_record."financeProfileId"
        OR connection_record."stripeAccountId" <> NEW."stripeAccountId"
        OR connection_record."livemode"
        OR plan_record."countryCode" <> 'GB'
        OR plan_record."currency" <> 'GBP'
        OR NEW."amountMinor" <> instalment_record."amountMinor"
        OR NEW."currency" <> 'GBP' THEN
        RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'FinanceDebitAttempt_scope_invalid',
          MESSAGE = 'Finance debit attempt does not match the approved GB collection scope';
      END IF;
      RETURN NEW;
    END;
    $body$
  $function$, core_schema);
  EXECUTE format(
    'CREATE TRIGGER "FinanceDebitAttempt_scope_guard" BEFORE INSERT OR UPDATE ON %1$I."FinanceDebitAttempt" FOR EACH ROW EXECUTE FUNCTION %1$I.finance_debit_attempt_scope_guard()',
    core_schema
  );
END;
$$;

DO $$
DECLARE
  core_schema text;
BEGIN
  SELECT n.nspname INTO STRICT core_schema
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE c.relname = 'FinanceCollectionPlanEvent'
    AND c.relkind IN ('r', 'p')
    AND n.nspname IN ('app', 'public');

  EXECUTE format($function$
    CREATE FUNCTION %1$I.finance_collection_plan_event_append_only()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = ''
    AS $body$
    BEGIN
      RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'FinanceCollectionPlanEvent_append_only',
        MESSAGE = 'Finance collection plan events are append-only';
    END;
    $body$
  $function$, core_schema);
  EXECUTE format(
    'CREATE TRIGGER "FinanceCollectionPlanEvent_append_only" BEFORE UPDATE OR DELETE ON %1$I."FinanceCollectionPlanEvent" FOR EACH ROW EXECUTE FUNCTION %1$I.finance_collection_plan_event_append_only()',
    core_schema
  );
  EXECUTE format(
    'CREATE TRIGGER "FinanceCollectionPlanEvent_no_truncate" BEFORE TRUNCATE ON %1$I."FinanceCollectionPlanEvent" FOR EACH STATEMENT EXECUTE FUNCTION %1$I.finance_receipt_ledger_row_append_only(''FinanceCollectionPlanEvent_no_truncate'')',
    core_schema
  );
END;
$$;
