-- Additive discovery/notification only; no money or issued snapshot is rewritten.
-- The function owner must see forced-RLS scopes. Runtime listener grants remain explicit.
DO $$
DECLARE core_schema text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = CURRENT_USER AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Finance webhook discovery requires an administrative migration role';
  END IF;
  SELECT n.nspname INTO STRICT core_schema
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relname = 'FinanceStripeConnection' AND c.relkind IN ('r', 'p')
    AND n.nspname IN ('app', 'public');
  PERFORM pg_catalog.set_config('search_path', pg_catalog.format('%I, %I', core_schema,
    CASE core_schema WHEN 'app' THEN 'public' ELSE 'app' END), false);
END;
$$;

CREATE INDEX "FinanceStripeWebhookEvent_mode_due_idx"
  ON "FinanceStripeWebhookEvent"("livemode", "status", "nextAttemptAt");
CREATE INDEX "FinanceStripeWebhookEvent_mode_claim_idx"
  ON "FinanceStripeWebhookEvent"("livemode", "status", "claimedAt");

CREATE FUNCTION app.notify_finance_stripe_webhook_work()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW."tenantId" IS NULL OR NEW."orgId" IS NULL
    OR NEW."status" NOT IN ('RECEIVED', 'RETRY', 'PROCESSING') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    PERFORM pg_catalog.pg_notify('finance_webhook_work', '');
  ELSIF NEW."status" IS DISTINCT FROM OLD."status"
    OR (NEW."status" IN ('RECEIVED', 'RETRY') AND NEW."nextAttemptAt" < OLD."nextAttemptAt") THEN
    -- Claim transitions schedule crash recovery; renewals deliberately stay silent.
    PERFORM pg_catalog.pg_notify('finance_webhook_work', '');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app.notify_finance_stripe_webhook_work() FROM PUBLIC;

CREATE TRIGGER "FinanceStripeWebhookEvent_notify_work"
AFTER INSERT OR UPDATE ON "FinanceStripeWebhookEvent"
FOR EACH ROW EXECUTE FUNCTION app.notify_finance_stripe_webhook_work();

DO $create$
DECLARE core_schema text := current_schema();
BEGIN
  EXECUTE pg_catalog.format($definition$
CREATE FUNCTION app.plan_finance_stripe_webhook_work(p_now TIMESTAMPTZ, p_livemode BOOLEAN, p_limit INTEGER)
RETURNS TABLE ("scopes" JSONB, "nextWakeAt" TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $body$
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now) OR p_livemode IS NULL
    OR p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid Finance webhook wake plan parameters';
  END IF;
  RETURN QUERY
  WITH eligible AS MATERIALIZED (
    SELECT e."tenantId", e."orgId",
      CASE WHEN e."status" = 'PROCESSING' THEN e."claimedAt" + INTERVAL '5 minutes'
        ELSE e."nextAttemptAt" END AS deadline
    FROM %1$I."FinanceStripeWebhookEvent" e
    WHERE e."livemode" = p_livemode AND e."tenantId" IS NOT NULL AND e."orgId" IS NOT NULL
      AND e."status" IN ('RECEIVED', 'RETRY', 'PROCESSING')
  ), due_scopes AS (
    SELECT e."tenantId", e."orgId", min(e.deadline) AS first_due
    FROM eligible e WHERE e.deadline <= (p_now AT TIME ZONE 'UTC')
    GROUP BY e."tenantId", e."orgId"
    ORDER BY first_due, e."tenantId", e."orgId" LIMIT p_limit
  )
  SELECT coalesce((SELECT jsonb_agg(jsonb_build_object('tenantId', s."tenantId", 'orgId', s."orgId")
      ORDER BY s.first_due, s."tenantId", s."orgId") FROM due_scopes s), '[]'::jsonb),
    (SELECT min(e.deadline) AT TIME ZONE 'UTC' FROM eligible e
      WHERE e.deadline > (p_now AT TIME ZONE 'UTC'));
END;
$body$;
$definition$, core_schema);
END;
$create$;
REVOKE ALL ON FUNCTION app.plan_finance_stripe_webhook_work(TIMESTAMPTZ, BOOLEAN, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.plan_finance_stripe_webhook_work(TIMESTAMPTZ, BOOLEAN, INTEGER) TO CURRENT_USER;
