-- Finance payer accounts and explicit, revocable account grants.
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

CREATE TABLE "FinancePayerAccount" (
  "id" TEXT NOT NULL,
  "financeProfileId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinancePayerAccount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinancePayerAccount_displayName_nonempty" CHECK (length(btrim("displayName")) > 0)
);

CREATE TABLE "FinancePayerGrant" (
  "id" TEXT NOT NULL,
  "financePayerAccountId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "payerUserId" TEXT NOT NULL,
  "grantedByUserId" TEXT NOT NULL,
  "revokedByUserId" TEXT,
  "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "FinancePayerGrant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinancePayerGrant_revocation_shape" CHECK (
    ("revokedAt" IS NULL AND "revokedByUserId" IS NULL)
    OR ("revokedAt" IS NOT NULL AND "revokedByUserId" IS NOT NULL)
  )
);

CREATE INDEX "FinancePayerAccount_financeProfileId_displayName_idx"
  ON "FinancePayerAccount"("financeProfileId", "displayName");
CREATE INDEX "FinancePayerAccount_tenantId_orgId_createdAt_idx"
  ON "FinancePayerAccount"("tenantId", "orgId", "createdAt");
CREATE UNIQUE INDEX "FinancePayerAccount_id_tenantId_orgId_key"
  ON "FinancePayerAccount"("id", "tenantId", "orgId");
CREATE INDEX "FinancePayerGrant_tenantId_orgId_financePayerAccountId_paye_idx"
  ON "FinancePayerGrant"("tenantId", "orgId", "financePayerAccountId", "payerUserId", "revokedAt");
CREATE INDEX "FinancePayerGrant_payerUserId_tenantId_orgId_revokedAt_idx"
  ON "FinancePayerGrant"("payerUserId", "tenantId", "orgId", "revokedAt");
CREATE UNIQUE INDEX "FinancePayerGrant_id_tenantId_orgId_key"
  ON "FinancePayerGrant"("id", "tenantId", "orgId");
CREATE UNIQUE INDEX "FinancePayerGrant_active_account_user_key"
  ON "FinancePayerGrant"("tenantId", "orgId", "financePayerAccountId", "payerUserId")
  WHERE "revokedAt" IS NULL;

ALTER TABLE "FinancePayerAccount"
  ADD CONSTRAINT "FinancePayerAccount_financeProfileId_tenantId_orgId_fkey"
  FOREIGN KEY ("financeProfileId", "tenantId", "orgId")
  REFERENCES "FinanceProfile"("id", "tenantId", "orgId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancePayerGrant"
  ADD CONSTRAINT "FinancePayerGrant_financePayerAccountId_tenantId_orgId_fkey"
  FOREIGN KEY ("financePayerAccountId", "tenantId", "orgId")
  REFERENCES "FinancePayerAccount"("id", "tenantId", "orgId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancePayerGrant"
  ADD CONSTRAINT "FinancePayerGrant_payerUserId_fkey"
  FOREIGN KEY ("payerUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancePayerGrant"
  ADD CONSTRAINT "FinancePayerGrant_grantedByUserId_fkey"
  FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancePayerGrant"
  ADD CONSTRAINT "FinancePayerGrant_revokedByUserId_fkey"
  FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['FinancePayerAccount', 'FinancePayerGrant']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I
         USING (app.current_tenant_id() IS NOT NULL
           AND app.current_org_id() IS NOT NULL
           AND "tenantId" = app.current_tenant_id()
           AND "orgId" = app.current_org_id())
         WITH CHECK (app.current_tenant_id() IS NOT NULL
           AND app.current_org_id() IS NOT NULL
           AND "tenantId" = app.current_tenant_id()
           AND "orgId" = app.current_org_id());',
      tbl || '_tenant_org_rls',
      tbl
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
