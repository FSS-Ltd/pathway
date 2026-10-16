-- Persist an in-flight add-on checkout and let the worker discover due trials.
DO $$
DECLARE
  trial_schema text;
BEGIN
  SELECT n.nspname INTO STRICT trial_schema
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE c.relname = 'InstitutionalAddonTrial'
    AND c.relkind IN ('r', 'p')
    AND n.nspname IN ('app', 'public');

  PERFORM pg_catalog.set_config(
    'search_path',
    pg_catalog.format('%I, %I', trial_schema, CASE trial_schema WHEN 'app' THEN 'public' ELSE 'app' END),
    false
  );
END;
$$;

ALTER TABLE "InstitutionalAddonTrial"
  ADD COLUMN "paidCheckoutSessionId" TEXT,
  ADD COLUMN "paidCheckoutAttempt" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "InstitutionalAddonTrial_paidCheckoutAttempt_check"
    CHECK ("paidCheckoutAttempt" >= 0);

CREATE UNIQUE INDEX "InstitutionalAddonTrial_paidCheckoutSessionId_key"
  ON "InstitutionalAddonTrial" ("paidCheckoutSessionId");
CREATE INDEX "InstitutionalAddonTrial_expiry_due_idx"
  ON "InstitutionalAddonTrial" ("status", "expiresAt", "orgId")
  WHERE "status" = 'ACTIVE' AND "expiresAt" IS NOT NULL AND "expiryEmailQueuedAt" IS NULL;

DO $$
DECLARE
  trial_schema text;
BEGIN
  SELECT n.nspname INTO STRICT trial_schema
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE c.relname = 'InstitutionalAddonTrial'
    AND c.relkind IN ('r', 'p')
    AND n.nspname IN ('app', 'public');

  EXECUTE pg_catalog.format($definition$
    CREATE FUNCTION app.list_due_institutional_addon_trial_org_ids(at_time TIMESTAMPTZ)
    RETURNS TABLE ("orgId" TEXT)
    LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $body$
      SELECT trial."orgId"
      FROM %I."InstitutionalAddonTrial" AS trial
      WHERE trial."status" = 'ACTIVE'
        AND trial."expiresAt" IS NOT NULL
        AND trial."expiresAt" <= at_time
        AND trial."expiryEmailQueuedAt" IS NULL
      GROUP BY trial."orgId"
      ORDER BY trial."orgId"
    $body$
  $definition$, trial_schema);
END;
$$;

REVOKE ALL ON FUNCTION app.list_due_institutional_addon_trial_org_ids(TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_due_institutional_addon_trial_org_ids(TIMESTAMPTZ) TO CURRENT_USER;
