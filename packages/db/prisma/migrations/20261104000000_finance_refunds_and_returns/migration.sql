-- Add independently approved refunds and append-only payment return movements.
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
    pg_catalog.format(
      '%I, %I',
      core_schema,
      CASE core_schema WHEN 'app' THEN 'public' ELSE 'app' END
    ),
    false
  );
END;
$$;

ALTER TYPE "FinanceCommandType" ADD VALUE IF NOT EXISTS 'REQUEST_REFUND';
ALTER TYPE "FinanceCommandType" ADD VALUE IF NOT EXISTS 'APPROVE_REFUND';
ALTER TYPE "FinanceCommandType" ADD VALUE IF NOT EXISTS 'REJECT_REFUND';
ALTER TYPE "FinanceCommandType" ADD VALUE IF NOT EXISTS 'CONFIRM_MANUAL_REFUND';
ALTER TYPE "FinanceCommandType" ADD VALUE IF NOT EXISTS 'REQUEST_REFUND_RETURN';
ALTER TYPE "FinanceCommandType" ADD VALUE IF NOT EXISTS 'APPROVE_REFUND_RETURN';
ALTER TYPE "FinanceCommandType" ADD VALUE IF NOT EXISTS 'REJECT_REFUND_RETURN';
ALTER TYPE "FinanceCommandResourceType" ADD VALUE IF NOT EXISTS 'REFUND';

CREATE TYPE "FinanceRefundStatus" AS ENUM (
  'PENDING', 'REJECTED', 'APPROVED', 'SUBMITTED', 'CONFIRMED', 'FAILED', 'RETURNED'
);
CREATE TYPE "FinanceRefundSource" AS ENUM ('MANUAL_TRANSFER', 'STRIPE_CARD');
CREATE TYPE "FinanceReceiptMovementType" AS ENUM (
  'REFUND', 'REFUND_RETURN', 'DISPUTE_WITHDRAWAL', 'DISPUTE_REINSTATEMENT'
);
CREATE TYPE "FinanceReceiptMovementSource" AS ENUM ('MANUAL_TRANSFER', 'STRIPE');
CREATE TYPE "FinanceRefundEventType" AS ENUM (
  'REQUESTED', 'APPROVED', 'REJECTED', 'SUBMITTED', 'CONFIRMED', 'FAILED', 'RETURNED',
  'RETURN_REQUESTED', 'RETURN_APPROVED', 'RETURN_REJECTED'
);

ALTER TABLE "FinanceCheckoutAttempt"
  ADD COLUMN "stripePaymentIntentId" VARCHAR(255);
CREATE UNIQUE INDEX "FinanceCheckoutAttempt_account_payment_intent_key"
  ON "FinanceCheckoutAttempt"("stripeAccountId", "stripePaymentIntentId");

DO $$
DECLARE
  core_schema text;
BEGIN
  SELECT n.nspname INTO STRICT core_schema
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE c.relname = 'FinanceCheckoutAttempt'
    AND c.relkind IN ('r', 'p')
    AND n.nspname IN ('app', 'public');

  EXECUTE format($sql$
    WITH candidates AS (
      SELECT
        event."stripeAccountId",
        event."tenantId",
        event."orgId",
        event."livemode",
        event."payloadJson" #>> '{data,object,id}' AS session_id,
        COALESCE(
          event."payloadJson" #>> '{data,object,payment_intent}',
          event."payloadJson" #>> '{data,object,payment_intent,id}'
        ) AS payment_intent_id
      FROM %1$I."FinanceStripeWebhookEvent" AS event
      WHERE event."status" = 'COMPLETED'
        AND event."tenantId" IS NOT NULL
        AND event."orgId" IS NOT NULL
        AND event."stripeAccountId" IS NOT NULL
        AND event."eventType" IN (
          'checkout.session.completed',
          'checkout.session.async_payment_succeeded'
        )
        AND (
          event."eventType" = 'checkout.session.async_payment_succeeded'
          OR event."payloadJson" #>> '{data,object,payment_status}' = 'paid'
        )
    ), resolved AS (
      SELECT
        "stripeAccountId", "tenantId", "orgId", "livemode", session_id,
        MIN(payment_intent_id) AS payment_intent_id
      FROM candidates
      WHERE left(session_id, 3) = 'cs_'
        AND left(payment_intent_id, 3) = 'pi_'
      GROUP BY "stripeAccountId", "tenantId", "orgId", "livemode", session_id
      HAVING COUNT(DISTINCT payment_intent_id) = 1
    )
    UPDATE %1$I."FinanceCheckoutAttempt" AS attempt
    SET "stripePaymentIntentId" = resolved.payment_intent_id
    FROM resolved
    WHERE attempt."stripeAccountId" = resolved."stripeAccountId"
      AND attempt."tenantId" = resolved."tenantId"
      AND attempt."orgId" = resolved."orgId"
      AND attempt."livemode" = resolved."livemode"
      AND attempt."stripeCheckoutSessionId" = resolved.session_id
      AND attempt."status" = 'PAID'
      AND attempt."stripePaymentIntentId" IS NULL
  $sql$, core_schema);
END;
$$;

CREATE TABLE "FinanceRefund" (
  "id" TEXT NOT NULL,
  "financeProfileId" TEXT NOT NULL,
  "receiptId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "requestedByUserId" TEXT NOT NULL,
  "approvedByUserId" TEXT,
  "source" "FinanceRefundSource" NOT NULL,
  "status" "FinanceRefundStatus" NOT NULL DEFAULT 'PENDING',
  "amountMinor" BIGINT NOT NULL,
  "currency" "FinanceCurrency" NOT NULL,
  "reason" TEXT NOT NULL,
  "decisionReason" TEXT,
  "bankTransactionReference" VARCHAR(255),
  "stripeAccountId" VARCHAR(255),
  "stripeRefundId" VARCHAR(255),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "approvedAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "providerStatusAt" TIMESTAMP(3),
  "confirmedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "returnedAt" TIMESTAMP(3),
  CONSTRAINT "FinanceRefund_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceRefund_amount_positive" CHECK ("amountMinor" > 0),
  CONSTRAINT "FinanceRefund_reason_nonempty" CHECK (length(btrim("reason")) > 0),
  CONSTRAINT "FinanceRefund_decision_reason_nonempty" CHECK (
    "decisionReason" IS NULL OR length(btrim("decisionReason")) > 0
  ),
  CONSTRAINT "FinanceRefund_decision_shape" CHECK (
    ("status" = 'PENDING' AND "approvedByUserId" IS NULL AND "approvedAt" IS NULL AND "decisionReason" IS NULL)
    OR ("status" = 'REJECTED' AND "approvedByUserId" IS NULL AND "approvedAt" IS NULL AND "decisionReason" IS NOT NULL)
    OR ("status" IN ('APPROVED', 'SUBMITTED', 'CONFIRMED', 'FAILED', 'RETURNED')
      AND "approvedByUserId" IS NOT NULL AND "approvedAt" IS NOT NULL AND "decisionReason" IS NOT NULL)
  ),
  CONSTRAINT "FinanceRefund_status_timestamp_shape" CHECK (
    ("status" <> 'SUBMITTED' OR "submittedAt" IS NOT NULL)
    AND ("status" NOT IN ('CONFIRMED', 'RETURNED') OR "confirmedAt" IS NOT NULL)
    AND ("status" <> 'FAILED' OR "failedAt" IS NOT NULL)
    AND ("status" <> 'RETURNED' OR "returnedAt" IS NOT NULL)
    AND ("source" <> 'MANUAL_TRANSFER' OR "status" <> 'CONFIRMED' OR "bankTransactionReference" IS NOT NULL)
  ),
  CONSTRAINT "FinanceRefund_provider_shape" CHECK (
    ("source" = 'STRIPE_CARD' AND "stripeAccountId" IS NOT NULL AND "bankTransactionReference" IS NULL)
    OR ("source" = 'MANUAL_TRANSFER' AND "stripeAccountId" IS NULL AND "stripeRefundId" IS NULL)
  )
);

CREATE UNIQUE INDEX "FinanceRefund_id_tenantId_orgId_key"
  ON "FinanceRefund"("id", "tenantId", "orgId");
CREATE UNIQUE INDEX "FinanceRefund_stripeAccountId_stripeRefundId_key"
  ON "FinanceRefund"("stripeAccountId", "stripeRefundId");
CREATE UNIQUE INDEX "FinanceRefund_financeProfileId_bankTransactionReference_key"
  ON "FinanceRefund"("financeProfileId", "bankTransactionReference");
CREATE INDEX "FinanceRefund_scope_receipt_status_createdAt_idx"
  ON "FinanceRefund"("tenantId", "orgId", "receiptId", "status", "createdAt");
CREATE INDEX "FinanceRefund_profile_status_createdAt_idx"
  ON "FinanceRefund"("financeProfileId", "status", "createdAt");

CREATE TABLE "FinanceRefundEvent" (
  "id" TEXT NOT NULL,
  "refundId" TEXT,
  "tenantId" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "stripeEventId" VARCHAR(255),
  "sourceReference" VARCHAR(255),
  "providerOccurredAt" TIMESTAMP(3),
  "type" "FinanceRefundEventType" NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceRefundEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FinanceRefundEvent_id_tenantId_orgId_key"
  ON "FinanceRefundEvent"("id", "tenantId", "orgId");
CREATE UNIQUE INDEX "FinanceRefundEvent_stripeEventId_key"
  ON "FinanceRefundEvent"("stripeEventId");
CREATE INDEX "FinanceRefundEvent_scope_refund_createdAt_idx"
  ON "FinanceRefundEvent"("tenantId", "orgId", "refundId", "createdAt");
CREATE INDEX "FinanceRefundEvent_scope_sourceReference_providerOccurredAt_idx"
  ON "FinanceRefundEvent"("tenantId", "orgId", "sourceReference", "providerOccurredAt");
CREATE UNIQUE INDEX "FinanceRefundEvent_manual_return_reference_key"
  ON "FinanceRefundEvent"("tenantId", "orgId", "sourceReference")
  WHERE "type" = 'RETURN_REQUESTED' AND "sourceReference" IS NOT NULL;

CREATE TABLE "FinanceReceiptMovement" (
  "id" TEXT NOT NULL,
  "financeProfileId" TEXT NOT NULL,
  "receiptId" TEXT NOT NULL,
  "refundId" TEXT,
  "tenantId" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "type" "FinanceReceiptMovementType" NOT NULL,
  "source" "FinanceReceiptMovementSource" NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "currency" "FinanceCurrency" NOT NULL,
  "sourceReference" VARCHAR(255) NOT NULL,
  "stripeEventId" VARCHAR(255),
  "originalMovementId" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "recordedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceReceiptMovement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceReceiptMovement_amount_positive" CHECK ("amountMinor" > 0),
  CONSTRAINT "FinanceReceiptMovement_source_reference_nonempty" CHECK (length(btrim("sourceReference")) > 0),
  CONSTRAINT "FinanceReceiptMovement_relationship_shape" CHECK (
    (("type" IN ('REFUND', 'DISPUTE_WITHDRAWAL')) AND "originalMovementId" IS NULL)
    OR (("type" IN ('REFUND_RETURN', 'DISPUTE_REINSTATEMENT')) AND "originalMovementId" IS NOT NULL)
  ),
  CONSTRAINT "FinanceReceiptMovement_source_shape" CHECK (
    ("type" = 'REFUND' AND (("source" = 'MANUAL_TRANSFER' AND "refundId" IS NOT NULL) OR "source" = 'STRIPE'))
    OR ("type" = 'REFUND_RETURN' AND ("source" = 'STRIPE' OR ("source" = 'MANUAL_TRANSFER' AND "refundId" IS NOT NULL)))
    OR ("type" IN ('DISPUTE_WITHDRAWAL', 'DISPUTE_REINSTATEMENT') AND "refundId" IS NULL AND "source" = 'STRIPE')
  )
);
CREATE UNIQUE INDEX "FinanceReceiptMovement_id_tenantId_orgId_key"
  ON "FinanceReceiptMovement"("id", "tenantId", "orgId");
CREATE UNIQUE INDEX "FinanceReceiptMovement_source_type_reference_key"
  ON "FinanceReceiptMovement"("financeProfileId", "source", "type", "sourceReference");
CREATE UNIQUE INDEX "FinanceReceiptMovement_stripeEventId_key"
  ON "FinanceReceiptMovement"("stripeEventId");
CREATE INDEX "FinanceReceiptMovement_scope_receipt_occurredAt_idx"
  ON "FinanceReceiptMovement"("tenantId", "orgId", "receiptId", "occurredAt");
CREATE INDEX "FinanceReceiptMovement_scope_type_occurredAt_idx"
  ON "FinanceReceiptMovement"("tenantId", "orgId", "type", "occurredAt");

CREATE TABLE "FinanceReceiptMovementApplication" (
  "id" TEXT NOT NULL,
  "movementId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "receiptAllocationId" TEXT NOT NULL,
  "reversesApplicationId" TEXT,
  "tenantId" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceReceiptMovementApplication_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceReceiptMovementApplication_amount_positive" CHECK ("amountMinor" > 0)
);
CREATE UNIQUE INDEX "FinanceReceiptMovementApplication_id_tenantId_orgId_key"
  ON "FinanceReceiptMovementApplication"("id", "tenantId", "orgId");
CREATE UNIQUE INDEX "FinanceReceiptMovementApplication_movement_reversal_key"
  ON "FinanceReceiptMovementApplication"("movementId", "reversesApplicationId");
CREATE INDEX "FinanceReceiptMovementApplication_scope_invoice_createdAt_idx"
  ON "FinanceReceiptMovementApplication"("tenantId", "orgId", "invoiceId", "createdAt");
CREATE INDEX "FinanceReceiptMovementApplication_scope_allocation_idx"
  ON "FinanceReceiptMovementApplication"("tenantId", "orgId", "receiptAllocationId");

ALTER TABLE "FinanceRefund"
  ADD CONSTRAINT "FinanceRefund_profile_scope_fkey"
  FOREIGN KEY ("financeProfileId", "tenantId", "orgId")
  REFERENCES "FinanceProfile"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceRefund_receipt_scope_fkey"
  FOREIGN KEY ("receiptId", "tenantId", "orgId")
  REFERENCES "FinanceReceipt"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceRefund_requester_fkey"
  FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceRefund_approver_fkey"
  FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceRefundEvent"
  ADD CONSTRAINT "FinanceRefundEvent_refund_scope_fkey"
  FOREIGN KEY ("refundId", "tenantId", "orgId")
  REFERENCES "FinanceRefund"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceRefundEvent_actor_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceReceiptMovement"
  ADD CONSTRAINT "FinanceReceiptMovement_profile_scope_fkey"
  FOREIGN KEY ("financeProfileId", "tenantId", "orgId")
  REFERENCES "FinanceProfile"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceReceiptMovement_receipt_scope_fkey"
  FOREIGN KEY ("receiptId", "tenantId", "orgId")
  REFERENCES "FinanceReceipt"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceReceiptMovement_refund_scope_fkey"
  FOREIGN KEY ("refundId", "tenantId", "orgId")
  REFERENCES "FinanceRefund"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceReceiptMovement_original_scope_fkey"
  FOREIGN KEY ("originalMovementId", "tenantId", "orgId")
  REFERENCES "FinanceReceiptMovement"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceReceiptMovement_recorder_fkey"
  FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceReceiptMovementApplication"
  ADD CONSTRAINT "FinanceReceiptMovementApplication_movement_scope_fkey"
  FOREIGN KEY ("movementId", "tenantId", "orgId")
  REFERENCES "FinanceReceiptMovement"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceReceiptMovementApplication_invoice_scope_fkey"
  FOREIGN KEY ("invoiceId", "tenantId", "orgId")
  REFERENCES "FinanceInvoice"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceReceiptMovementApplication_allocation_scope_fkey"
  FOREIGN KEY ("receiptAllocationId", "tenantId", "orgId")
  REFERENCES "FinanceReceiptAllocation"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceReceiptMovementApplication_reversed_scope_fkey"
  FOREIGN KEY ("reversesApplicationId", "tenantId", "orgId")
  REFERENCES "FinanceReceiptMovementApplication"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$
DECLARE
  core_schema text;
BEGIN
  SELECT n.nspname INTO STRICT core_schema
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE c.relname = 'FinanceRefund'
    AND c.relkind IN ('r', 'p')
    AND n.nspname IN ('app', 'public');

  EXECUTE format($function$
    CREATE FUNCTION %1$I.finance_refund_transition_guard()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = ''
    AS $body$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'FinanceRefund_append_only',
          MESSAGE = 'Finance refund requests cannot be deleted';
      END IF;
      IF (
        NEW."id", NEW."financeProfileId", NEW."receiptId", NEW."tenantId", NEW."orgId",
        NEW."requestedByUserId", NEW."source", NEW."amountMinor", NEW."currency", NEW."reason", NEW."createdAt"
      ) IS DISTINCT FROM (
        OLD."id", OLD."financeProfileId", OLD."receiptId", OLD."tenantId", OLD."orgId",
        OLD."requestedByUserId", OLD."source", OLD."amountMinor", OLD."currency", OLD."reason", OLD."createdAt"
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'FinanceRefund_facts_immutable',
          MESSAGE = 'Finance refund request facts cannot be changed';
      END IF;
      IF NEW."stripeAccountId" IS DISTINCT FROM OLD."stripeAccountId"
        OR (OLD."approvedByUserId" IS NOT NULL AND NEW."approvedByUserId" IS DISTINCT FROM OLD."approvedByUserId")
        OR (OLD."approvedAt" IS NOT NULL AND NEW."approvedAt" IS DISTINCT FROM OLD."approvedAt")
        OR (OLD."decisionReason" IS NOT NULL AND NEW."decisionReason" IS DISTINCT FROM OLD."decisionReason")
        OR (OLD."bankTransactionReference" IS NOT NULL AND NEW."bankTransactionReference" IS DISTINCT FROM OLD."bankTransactionReference")
        OR (OLD."stripeRefundId" IS NOT NULL AND NEW."stripeRefundId" IS DISTINCT FROM OLD."stripeRefundId") THEN
        RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'FinanceRefund_decision_facts_immutable',
          MESSAGE = 'Finance refund approval and provider facts cannot be changed';
      END IF;
      IF OLD."status" = NEW."status" THEN
        RETURN NEW;
      END IF;
      IF NOT (
        (OLD."status" = 'PENDING' AND NEW."status" IN ('APPROVED', 'REJECTED'))
        OR (OLD."status" = 'APPROVED' AND NEW."status" IN ('SUBMITTED', 'CONFIRMED', 'FAILED'))
        OR (OLD."status" = 'SUBMITTED' AND NEW."status" IN ('CONFIRMED', 'FAILED'))
        OR (OLD."status" = 'FAILED' AND NEW."status" = 'CONFIRMED')
        OR (OLD."status" = 'CONFIRMED' AND NEW."status" = 'RETURNED')
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'FinanceRefund_transition_invalid',
          MESSAGE = 'Finance refund status transition is invalid';
      END IF;
      RETURN NEW;
    END;
    $body$
  $function$, core_schema);
  EXECUTE format(
    'CREATE TRIGGER "FinanceRefund_transition_guard" BEFORE UPDATE OR DELETE ON %1$I."FinanceRefund" FOR EACH ROW EXECUTE FUNCTION %1$I.finance_refund_transition_guard()',
    core_schema
  );

  EXECUTE format($function$
    CREATE FUNCTION %1$I.finance_receipt_movement_scope_guard()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = ''
    AS $body$
    DECLARE
      receipt_profile text;
      receipt_currency text;
      receipt_status text;
      receipt_source text;
      original_type text;
      original_receipt_id text;
      original_source text;
      original_refund_id text;
      original_amount bigint;
      returned_amount bigint;
    BEGIN
      SELECT "financeProfileId", "currency", "status", "source"
        INTO receipt_profile, receipt_currency, receipt_status, receipt_source
      FROM %1$I."FinanceReceipt"
      WHERE "id" = NEW."receiptId" AND "tenantId" = NEW."tenantId" AND "orgId" = NEW."orgId"
      FOR UPDATE;
      IF NOT FOUND OR receipt_profile <> NEW."financeProfileId" OR receipt_currency <> NEW."currency"::text
        OR receipt_status <> 'CONFIRMED' THEN
        RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'FinanceReceiptMovement_receipt_scope_invalid',
          MESSAGE = 'Finance receipt movement must match a confirmed receipt';
      END IF;
      IF (NEW."source" = 'STRIPE' AND receipt_source <> 'STRIPE_CARD')
        OR (NEW."source" = 'MANUAL_TRANSFER' AND receipt_source <> 'MANUAL_TRANSFER') THEN
        RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'FinanceReceiptMovement_source_invalid',
          MESSAGE = 'Finance receipt movement source does not match its receipt';
      END IF;
      IF NEW."refundId" IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM %1$I."FinanceRefund" AS refund
        WHERE refund."id" = NEW."refundId" AND refund."receiptId" = NEW."receiptId"
          AND refund."financeProfileId" = NEW."financeProfileId"
          AND refund."tenantId" = NEW."tenantId" AND refund."orgId" = NEW."orgId"
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'FinanceReceiptMovement_refund_scope_invalid',
          MESSAGE = 'Finance receipt movement refund does not match its receipt';
      END IF;
      IF NEW."originalMovementId" IS NOT NULL THEN
        SELECT "type", "receiptId", "source", "refundId", "amountMinor"
          INTO original_type, original_receipt_id, original_source, original_refund_id, original_amount
        FROM %1$I."FinanceReceiptMovement"
        WHERE "id" = NEW."originalMovementId" AND "tenantId" = NEW."tenantId" AND "orgId" = NEW."orgId"
        FOR UPDATE;
        IF NOT FOUND OR original_receipt_id <> NEW."receiptId"
          OR (NEW."type" = 'REFUND_RETURN' AND original_type <> 'REFUND')
          OR (NEW."type" = 'DISPUTE_REINSTATEMENT' AND original_type <> 'DISPUTE_WITHDRAWAL')
          OR original_source <> NEW."source"::text
          OR (NEW."type" = 'REFUND_RETURN' AND NEW."refundId" IS DISTINCT FROM original_refund_id) THEN
          RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'FinanceReceiptMovement_original_invalid',
            MESSAGE = 'Finance receipt movement must reverse its matching prior movement';
        END IF;
        SELECT COALESCE(SUM("amountMinor"), 0) INTO returned_amount
        FROM %1$I."FinanceReceiptMovement"
        WHERE "originalMovementId" = NEW."originalMovementId"
          AND "tenantId" = NEW."tenantId" AND "orgId" = NEW."orgId";
        IF NEW."amountMinor" > original_amount - returned_amount THEN
          RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'FinanceReceiptMovement_return_exceeds_source',
            MESSAGE = 'Finance receipt return exceeds its original movement';
        END IF;
      END IF;
      RETURN NEW;
    END;
    $body$
  $function$, core_schema);
  EXECUTE format(
    'CREATE TRIGGER "FinanceReceiptMovement_scope_guard" BEFORE INSERT ON %1$I."FinanceReceiptMovement" FOR EACH ROW EXECUTE FUNCTION %1$I.finance_receipt_movement_scope_guard()',
    core_schema
  );

  EXECUTE format($function$
    CREATE FUNCTION %1$I.finance_receipt_movement_application_scope_guard()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = ''
    AS $body$
    DECLARE
      movement_amount bigint;
      movement_applied bigint;
      movement_receipt_id text;
      movement_type text;
      movement_original_id text;
      allocation_receipt_id text;
      allocation_invoice_id text;
      original_amount bigint;
      original_invoice_id text;
      original_allocation_id text;
      original_application_movement_id text;
      original_application_movement_type text;
      already_reversed bigint;
    BEGIN
      SELECT "receiptId", "type"::text, "amountMinor", "originalMovementId"
        INTO movement_receipt_id, movement_type, movement_amount, movement_original_id
      FROM %1$I."FinanceReceiptMovement"
      WHERE "id" = NEW."movementId" AND "tenantId" = NEW."tenantId" AND "orgId" = NEW."orgId"
      FOR UPDATE;
      IF movement_receipt_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'FinanceReceiptMovementApplication_movement_missing',
          MESSAGE = 'Finance movement application requires an existing movement';
      END IF;
      SELECT COALESCE(SUM("amountMinor"), 0) INTO movement_applied
      FROM %1$I."FinanceReceiptMovementApplication"
      WHERE "movementId" = NEW."movementId" AND "tenantId" = NEW."tenantId" AND "orgId" = NEW."orgId";
      IF NEW."amountMinor" > movement_amount - movement_applied THEN
        RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'FinanceReceiptMovementApplication_exceeds_movement',
          MESSAGE = 'Finance movement applications exceed the movement amount';
      END IF;
      SELECT "receiptId", "invoiceId" INTO allocation_receipt_id, allocation_invoice_id
      FROM %1$I."FinanceReceiptAllocation"
      WHERE "id" = NEW."receiptAllocationId" AND "tenantId" = NEW."tenantId" AND "orgId" = NEW."orgId";
      IF NOT FOUND OR movement_receipt_id <> allocation_receipt_id OR allocation_invoice_id <> NEW."invoiceId" THEN
        RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'FinanceReceiptMovementApplication_scope_invalid',
          MESSAGE = 'Finance movement application must match its receipt allocation';
      END IF;
      IF NEW."reversesApplicationId" IS NOT NULL THEN
        SELECT
          application."amountMinor",
          application."invoiceId",
          application."receiptAllocationId",
          application."movementId",
          source_movement."type"::text
        INTO
          original_amount,
          original_invoice_id,
          original_allocation_id,
          original_application_movement_id,
          original_application_movement_type
        FROM %1$I."FinanceReceiptMovementApplication" AS application
        JOIN %1$I."FinanceReceiptMovement" AS source_movement
          ON source_movement."id" = application."movementId"
          AND source_movement."tenantId" = application."tenantId"
          AND source_movement."orgId" = application."orgId"
        WHERE application."id" = NEW."reversesApplicationId"
          AND application."tenantId" = NEW."tenantId"
          AND application."orgId" = NEW."orgId"
        FOR UPDATE OF application, source_movement;
        IF NOT FOUND OR movement_type NOT IN ('REFUND_RETURN', 'DISPUTE_REINSTATEMENT')
          OR movement_original_id IS DISTINCT FROM original_application_movement_id
          OR (movement_type = 'REFUND_RETURN' AND original_application_movement_type <> 'REFUND')
          OR (movement_type = 'DISPUTE_REINSTATEMENT' AND original_application_movement_type <> 'DISPUTE_WITHDRAWAL')
          OR original_invoice_id <> NEW."invoiceId"
          OR original_allocation_id <> NEW."receiptAllocationId" THEN
          RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'FinanceReceiptMovementApplication_reversal_invalid',
            MESSAGE = 'Finance movement application reversal is invalid';
        END IF;
        SELECT COALESCE(SUM("amountMinor"), 0) INTO already_reversed
        FROM %1$I."FinanceReceiptMovementApplication"
        WHERE "reversesApplicationId" = NEW."reversesApplicationId"
          AND "tenantId" = NEW."tenantId" AND "orgId" = NEW."orgId";
        IF NEW."amountMinor" > original_amount - already_reversed THEN
          RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'FinanceReceiptMovementApplication_reversal_exceeds_source',
            MESSAGE = 'Finance movement application reversal exceeds its source';
        END IF;
      ELSIF movement_type IN ('REFUND_RETURN', 'DISPUTE_REINSTATEMENT') THEN
        RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'FinanceReceiptMovementApplication_reversal_required',
          MESSAGE = 'Finance movement return must reference its original application';
      END IF;
      RETURN NEW;
    END;
    $body$
  $function$, core_schema);
  EXECUTE format(
    'CREATE TRIGGER "FinanceReceiptMovementApplication_scope_guard" BEFORE INSERT ON %1$I."FinanceReceiptMovementApplication" FOR EACH ROW EXECUTE FUNCTION %1$I.finance_receipt_movement_application_scope_guard()',
    core_schema
  );
END;
$$;

CREATE TRIGGER "FinanceRefundEvent_append_only"
BEFORE UPDATE OR DELETE ON "FinanceRefundEvent"
FOR EACH ROW EXECUTE FUNCTION finance_receipt_ledger_row_append_only('FinanceRefundEvent_append_only');
CREATE TRIGGER "FinanceReceiptMovement_append_only"
BEFORE UPDATE OR DELETE ON "FinanceReceiptMovement"
FOR EACH ROW EXECUTE FUNCTION finance_receipt_ledger_row_append_only('FinanceReceiptMovement_append_only');
CREATE TRIGGER "FinanceReceiptMovementApplication_append_only"
BEFORE UPDATE OR DELETE ON "FinanceReceiptMovementApplication"
FOR EACH ROW EXECUTE FUNCTION finance_receipt_ledger_row_append_only('FinanceReceiptMovementApplication_append_only');
CREATE TRIGGER "FinanceRefundEvent_no_truncate"
BEFORE TRUNCATE ON "FinanceRefundEvent"
FOR EACH STATEMENT EXECUTE FUNCTION finance_receipt_ledger_row_append_only('FinanceRefundEvent_no_truncate');
CREATE TRIGGER "FinanceReceiptMovement_no_truncate"
BEFORE TRUNCATE ON "FinanceReceiptMovement"
FOR EACH STATEMENT EXECUTE FUNCTION finance_receipt_ledger_row_append_only('FinanceReceiptMovement_no_truncate');
CREATE TRIGGER "FinanceReceiptMovementApplication_no_truncate"
BEFORE TRUNCATE ON "FinanceReceiptMovementApplication"
FOR EACH STATEMENT EXECUTE FUNCTION finance_receipt_ledger_row_append_only('FinanceReceiptMovementApplication_no_truncate');

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'FinanceRefund', 'FinanceRefundEvent', 'FinanceReceiptMovement', 'FinanceReceiptMovementApplication'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (app.current_tenant_id() IS NOT NULL AND app.current_org_id() IS NOT NULL AND "tenantId" = app.current_tenant_id() AND "orgId" = app.current_org_id()) WITH CHECK (app.current_tenant_id() IS NOT NULL AND app.current_org_id() IS NOT NULL AND "tenantId" = app.current_tenant_id() AND "orgId" = app.current_org_id());',
      tbl || '_tenant_org_rls', tbl
    );
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM PUBLIC;', tbl);
    IF to_regrole('anon') IS NOT NULL THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM anon;', tbl);
    END IF;
    IF to_regrole('authenticated') IS NOT NULL THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM authenticated;', tbl);
    END IF;
  END LOOP;
END;
$$;
