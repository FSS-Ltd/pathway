-- Keep Finance tables beside the physical core tables. Production uses public;
-- fresh installations may use app.
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

CREATE FUNCTION finance_invoice_protect_issued_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD."status" IN ('ISSUED', 'VOID') THEN
    IF (
      NEW."id",
      NEW."financeProfileId",
      NEW."tenantId",
      NEW."orgId",
      NEW."invoiceNumber",
      NEW."currency",
      NEW."subtotalMinor",
      NEW."taxMinor",
      NEW."totalMinor",
      NEW."issuedAt",
      NEW."dueAt",
      NEW."createdAt"
    ) IS DISTINCT FROM (
      OLD."id",
      OLD."financeProfileId",
      OLD."tenantId",
      OLD."orgId",
      OLD."invoiceNumber",
      OLD."currency",
      OLD."subtotalMinor",
      OLD."taxMinor",
      OLD."totalMinor",
      OLD."issuedAt",
      OLD."dueAt",
      OLD."createdAt"
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        CONSTRAINT = 'FinanceInvoice_issued_snapshot_immutable',
        MESSAGE = 'Issued invoice snapshots cannot be changed';
    END IF;

    IF OLD."status" = 'VOID' AND NEW."status" <> 'VOID' THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        CONSTRAINT = 'FinanceInvoice_void_is_terminal',
        MESSAGE = 'Voided invoices cannot be reopened';
    END IF;

    IF OLD."status" = 'ISSUED' AND NEW."status" NOT IN ('ISSUED', 'VOID') THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        CONSTRAINT = 'FinanceInvoice_issued_transition',
        MESSAGE = 'Issued invoices may only be voided';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "FinanceInvoice_protect_issued_snapshot"
BEFORE UPDATE ON "FinanceInvoice"
FOR EACH ROW
EXECUTE FUNCTION finance_invoice_protect_issued_snapshot();

CREATE FUNCTION finance_invoice_line_require_draft()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  invoice_status text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    EXECUTE pg_catalog.format(
      'SELECT "status"::text FROM %I."FinanceInvoice"
       WHERE "id" = $1 AND "tenantId" = $2 AND "orgId" = $3',
      TG_TABLE_SCHEMA
    ) INTO invoice_status USING NEW."invoiceId", NEW."tenantId", NEW."orgId";
  ELSE
    EXECUTE pg_catalog.format(
      'SELECT "status"::text FROM %I."FinanceInvoice"
       WHERE "id" = $1 AND "tenantId" = $2 AND "orgId" = $3',
      TG_TABLE_SCHEMA
    ) INTO invoice_status USING OLD."invoiceId", OLD."tenantId", OLD."orgId";
  END IF;

  IF invoice_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'FinanceInvoiceLine_draft_only',
      MESSAGE = 'Invoice lines may only change while the invoice is a draft';
  END IF;

  IF TG_OP = 'UPDATE'
    AND (NEW."invoiceId", NEW."tenantId", NEW."orgId")
      IS DISTINCT FROM (OLD."invoiceId", OLD."tenantId", OLD."orgId") THEN
    EXECUTE pg_catalog.format(
      'SELECT "status"::text FROM %I."FinanceInvoice"
       WHERE "id" = $1 AND "tenantId" = $2 AND "orgId" = $3',
      TG_TABLE_SCHEMA
    ) INTO invoice_status USING NEW."invoiceId", NEW."tenantId", NEW."orgId";

    IF invoice_status IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        CONSTRAINT = 'FinanceInvoiceLine_draft_only',
        MESSAGE = 'Invoice lines may only change while the invoice is a draft';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "FinanceInvoiceLine_require_draft"
BEFORE INSERT OR UPDATE OR DELETE ON "FinanceInvoiceLine"
FOR EACH ROW
EXECUTE FUNCTION finance_invoice_line_require_draft();
