-- Freeze reviewed content and serialize line edits against lifecycle transitions.
DO $$
DECLARE
  core_schema text;
BEGIN
  SELECT n.nspname INTO STRICT core_schema
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE c.relname = 'Org'
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

CREATE FUNCTION finance_invoice_lifecycle_content_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW."createdByUserId" IS DISTINCT FROM OLD."createdByUserId" THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'FinanceInvoice_creator_immutable',
      MESSAGE = 'Invoice creator evidence cannot be changed';
  END IF;

  IF OLD."status" IN ('DRAFT', 'IN_REVIEW') AND NEW."status" IN ('IN_REVIEW', 'DRAFT', 'ISSUED')
    AND (
      NEW."id", NEW."financeProfileId", NEW."payerAccountId", NEW."tenantId", NEW."orgId",
      NEW."currency", NEW."subtotalMinor", NEW."taxMinor", NEW."totalMinor", NEW."dueAt",
      NEW."createdByUserId", NEW."createdAt"
    ) IS DISTINCT FROM (
      OLD."id", OLD."financeProfileId", OLD."payerAccountId", OLD."tenantId", OLD."orgId",
      OLD."currency", OLD."subtotalMinor", OLD."taxMinor", OLD."totalMinor", OLD."dueAt",
      OLD."createdByUserId", OLD."createdAt"
    ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'FinanceInvoice_review_content_immutable',
      MESSAGE = 'Invoice content cannot change during review or issue';
  END IF;

  IF OLD."status" = 'IN_REVIEW' AND NEW."status" IN ('IN_REVIEW', 'DRAFT')
    AND (NEW."payerNameSnapshot", NEW."legalEntityNameSnapshot")
      IS DISTINCT FROM (OLD."payerNameSnapshot", OLD."legalEntityNameSnapshot") THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'FinanceInvoice_review_snapshot_immutable',
      MESSAGE = 'Invoice snapshots can only be set when issued';
  END IF;

  IF OLD."status" = 'IN_REVIEW' AND NEW."status" = 'IN_REVIEW'
    AND OLD."approvedAt" IS NOT NULL
    AND (NEW."approvedAt", NEW."approvedByUserId")
      IS DISTINCT FROM (OLD."approvedAt", OLD."approvedByUserId") THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'FinanceInvoice_approval_immutable',
      MESSAGE = 'Invoice approval evidence cannot be replaced';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "FinanceInvoice_lifecycle_content_guard"
BEFORE UPDATE ON "FinanceInvoice"
FOR EACH ROW EXECUTE FUNCTION finance_invoice_lifecycle_content_guard();

CREATE OR REPLACE FUNCTION finance_invoice_line_require_draft()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  invoice_status text;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW."invoiceId", NEW."tenantId", NEW."orgId"
  ) IS DISTINCT FROM (
    OLD."invoiceId", OLD."tenantId", OLD."orgId"
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'FinanceInvoiceLine_parent_immutable',
      MESSAGE = 'Invoice lines cannot move between invoices';
  END IF;

  IF TG_OP = 'INSERT' THEN
    EXECUTE pg_catalog.format(
      'SELECT "status"::text FROM %I."FinanceInvoice" WHERE "id" = $1 AND "tenantId" = $2 AND "orgId" = $3 FOR UPDATE',
      TG_TABLE_SCHEMA
    ) INTO invoice_status USING NEW."invoiceId", NEW."tenantId", NEW."orgId";
  ELSE
    EXECUTE pg_catalog.format(
      'SELECT "status"::text FROM %I."FinanceInvoice" WHERE "id" = $1 AND "tenantId" = $2 AND "orgId" = $3 FOR UPDATE',
      TG_TABLE_SCHEMA
    ) INTO invoice_status USING OLD."invoiceId", OLD."tenantId", OLD."orgId";
  END IF;

  IF invoice_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'FinanceInvoiceLine_draft_only',
      MESSAGE = 'Invoice lines may only change while the invoice is a draft';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION finance_credit_note_lifecycle_content_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW."createdByUserId" IS DISTINCT FROM OLD."createdByUserId" THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'FinanceCreditNote_creator_immutable',
      MESSAGE = 'Credit note creator evidence cannot be changed';
  END IF;

  IF OLD."status" IN ('DRAFT', 'IN_REVIEW') AND NEW."status" IN ('IN_REVIEW', 'DRAFT', 'ISSUED', 'VOID')
    AND (
      NEW."id", NEW."financeProfileId", NEW."invoiceId", NEW."tenantId", NEW."orgId",
      NEW."reason", NEW."currency", NEW."subtotalMinor", NEW."taxMinor", NEW."totalMinor",
      NEW."createdByUserId", NEW."createdAt"
    ) IS DISTINCT FROM (
      OLD."id", OLD."financeProfileId", OLD."invoiceId", OLD."tenantId", OLD."orgId",
      OLD."reason", OLD."currency", OLD."subtotalMinor", OLD."taxMinor", OLD."totalMinor",
      OLD."createdByUserId", OLD."createdAt"
    ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'FinanceCreditNote_review_content_immutable',
      MESSAGE = 'Credit note content cannot change during review or issue';
  END IF;

  IF OLD."status" = 'IN_REVIEW' AND NEW."status" IN ('IN_REVIEW', 'DRAFT', 'VOID')
    AND (NEW."payerNameSnapshot", NEW."legalEntityNameSnapshot")
      IS DISTINCT FROM (OLD."payerNameSnapshot", OLD."legalEntityNameSnapshot") THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'FinanceCreditNote_review_snapshot_immutable',
      MESSAGE = 'Credit note snapshots can only be set when issued';
  END IF;

  IF OLD."status" = 'IN_REVIEW' AND NEW."status" = 'IN_REVIEW'
    AND OLD."approvedAt" IS NOT NULL
    AND (NEW."approvedAt", NEW."approvedByUserId")
      IS DISTINCT FROM (OLD."approvedAt", OLD."approvedByUserId") THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'FinanceCreditNote_approval_immutable',
      MESSAGE = 'Credit note approval evidence cannot be replaced';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "FinanceCreditNote_lifecycle_content_guard"
BEFORE UPDATE ON "FinanceCreditNote"
FOR EACH ROW EXECUTE FUNCTION finance_credit_note_lifecycle_content_guard();

CREATE OR REPLACE FUNCTION finance_credit_note_line_require_draft()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  note_status text;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW."creditNoteId", NEW."invoiceId", NEW."tenantId", NEW."orgId"
  ) IS DISTINCT FROM (
    OLD."creditNoteId", OLD."invoiceId", OLD."tenantId", OLD."orgId"
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'FinanceCreditNoteLine_parent_immutable',
      MESSAGE = 'Credit note lines cannot move between credit notes';
  END IF;

  IF TG_OP = 'INSERT' THEN
    EXECUTE pg_catalog.format(
      'SELECT "status"::text FROM %I."FinanceCreditNote" WHERE "id" = $1 AND "tenantId" = $2 AND "orgId" = $3 FOR UPDATE',
      TG_TABLE_SCHEMA
    ) INTO note_status USING NEW."creditNoteId", NEW."tenantId", NEW."orgId";
  ELSE
    EXECUTE pg_catalog.format(
      'SELECT "status"::text FROM %I."FinanceCreditNote" WHERE "id" = $1 AND "tenantId" = $2 AND "orgId" = $3 FOR UPDATE',
      TG_TABLE_SCHEMA
    ) INTO note_status USING OLD."creditNoteId", OLD."tenantId", OLD."orgId";
  END IF;

  IF note_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'FinanceCreditNoteLine_draft_only',
      MESSAGE = 'Credit note lines may only change while the note is a draft';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
