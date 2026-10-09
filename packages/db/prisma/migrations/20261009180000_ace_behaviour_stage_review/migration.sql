ALTER TABLE "DemeritStageOverride"
  ADD COLUMN "clientCommandKeyHash" TEXT,
  ADD COLUMN "commandFingerprint" TEXT;

CREATE UNIQUE INDEX "DemeritStageOverride_tenantId_clientCommandKeyHash_key"
  ON "DemeritStageOverride"("tenantId", "clientCommandKeyHash");
CREATE UNIQUE INDEX "DemeritStageOverride_id_tenantId_childId_key"
  ON "DemeritStageOverride"("id", "tenantId", "childId");

-- The legacy User.tenantId can be NULL for organisation Heads. Resolve fixed
-- reviewers without filtering those active users through User's site RLS.
CREATE FUNCTION app.ace_behaviour_active_reviewers(
  site_id text, org_id text, reviewer_kind text, as_of timestamp
)
RETURNS TABLE("userId" text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  data_schema text;
BEGIN
  IF site_id IS DISTINCT FROM app.current_tenant_id()
     OR org_id IS DISTINCT FROM app.current_org_id()
     OR reviewer_kind NOT IN ('HEAD', 'SITE') THEN
    RETURN;
  END IF;
  SELECT namespace.nspname INTO data_schema
  FROM pg_catalog.pg_class relation
  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
  WHERE relation.relname = 'UserRoleAssignment'
    AND relation.relkind IN ('r', 'p')
    AND namespace.nspname IN ('public', 'app')
  ORDER BY (namespace.nspname = 'public') DESC
  LIMIT 1;
  IF data_schema IS NULL THEN RETURN; END IF;

  RETURN QUERY EXECUTE pg_catalog.format(
    'SELECT DISTINCT assignment."userId"
       FROM %1$I."UserRoleAssignment" assignment
       JOIN %1$I."OrgRoleDefinition" definition
         ON definition."id" = assignment."roleDefinitionId"
       JOIN %1$I."User" reviewer ON reviewer."id" = assignment."userId"
       JOIN %1$I."Tenant" site ON site."id" = $1 AND site."orgId" = $2
      WHERE assignment."orgId" = $2
        AND assignment."tenantId" IS NOT DISTINCT FROM
            CASE WHEN $3 = ''HEAD'' THEN NULL ELSE $1 END
        AND assignment."revokedAt" IS NULL
        AND assignment."startsAt" <= $4
        AND (assignment."expiresAt" IS NULL OR assignment."expiresAt" > $4)
        AND reviewer."isActive" = true
        AND definition."orgId" = $2
        AND definition."tenantId" IS NOT DISTINCT FROM
            CASE WHEN $3 = ''HEAD'' THEN NULL ELSE $1 END
        AND definition."name" = CASE WHEN $3 = ''HEAD''
            THEN ''Organisation Head'' ELSE ''Site Lead'' END
        AND definition."scope"::text = CASE WHEN $3 = ''HEAD''
            THEN ''organisation'' ELSE ''site'' END
        AND definition."isSystem" = true
        AND definition."isActive" = true', data_schema
  ) USING site_id, org_id, reviewer_kind, as_of;
END;
$$;
REVOKE ALL ON FUNCTION app.ace_behaviour_active_reviewers(text, text, text, timestamp)
  FROM PUBLIC;

CREATE TABLE "BehaviourReviewRequest" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "behaviourEntryId" TEXT,
  "demeritStageOverrideId" TEXT,
  "kind" TEXT NOT NULL,
  "stage" INTEGER NOT NULL,
  "policyVersion" INTEGER NOT NULL,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BehaviourReviewRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BehaviourReviewRequest_kind_check" CHECK ("kind" IN ('SITE', 'HEAD')),
  CONSTRAINT "BehaviourReviewRequest_stage_check" CHECK ("stage" BETWEEN 1 AND 3),
  CONSTRAINT "BehaviourReviewRequest_policyVersion_check" CHECK ("policyVersion" > 0),
  CONSTRAINT "BehaviourReviewRequest_target_check" CHECK
    (("behaviourEntryId" IS NOT NULL) <> ("demeritStageOverrideId" IS NOT NULL)),
  CONSTRAINT "BehaviourReviewRequest_tenantId_fkey" FOREIGN KEY ("tenantId")
    REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BehaviourReviewRequest_childId_tenantId_fkey" FOREIGN KEY ("childId", "tenantId")
    REFERENCES "Child"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BehaviourReviewRequest_behaviourEntryId_tenantId_childId_fkey"
    FOREIGN KEY ("behaviourEntryId", "tenantId", "childId")
    REFERENCES "BehaviourEntry"("id", "tenantId", "childId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "BehaviourReviewRequest_demeritStageOverrideId_tenantId_childId_fkey"
    FOREIGN KEY ("demeritStageOverrideId", "tenantId", "childId")
    REFERENCES "DemeritStageOverride"("id", "tenantId", "childId") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "BehaviourReviewRequest_behaviourEntryId_stage_kind_key"
  ON "BehaviourReviewRequest"("behaviourEntryId", "stage", "kind");
CREATE UNIQUE INDEX "BehaviourReviewRequest_demeritStageOverrideId_stage_kind_key"
  ON "BehaviourReviewRequest"("demeritStageOverrideId", "stage", "kind");
CREATE INDEX "BehaviourReviewRequest_tenantId_requestedAt_id_idx"
  ON "BehaviourReviewRequest"("tenantId", "requestedAt" DESC, "id" DESC);
CREATE INDEX "BehaviourReviewRequest_tenantId_childId_requestedAt_idx"
  ON "BehaviourReviewRequest"("tenantId", "childId", "requestedAt" DESC);

-- Backfill only review intents whose source fact and scope can be proven.
-- An invalid historical intent is left out rather than linked to another site.
-- Fail rather than silently reading zero rows if the migration role cannot
-- bypass the source tables' forced RLS during this cross-organisation copy.
SET row_security = off;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "OutboxEvent" o
    LEFT JOIN "BehaviourEntry" e ON e."id" = o."aggregateId"
    LEFT JOIN "Tenant" t ON t."id" = e."tenantId"
    WHERE o."eventType" = 'behaviour.review-requested'
      AND NOT COALESCE(
        o."aggregateType" = 'BEHAVIOUR_ENTRY'
        AND e."id" IS NOT NULL
        AND t."orgId" = o."orgId"
        AND o.payload->>'behaviourEntryId' = e."id"
        AND o.payload->>'tenantId' = e."tenantId"
        AND o.payload->>'childId' = e."childId"
        AND o.payload->>'orgId' = o."orgId"
        AND o.payload->>'reviewKind' IN ('SITE', 'HEAD')
        AND o.payload->>'stage' IN ('1', '2', '3')
        AND o.payload->>'demeritPolicyVersion' ~ '^[1-9][0-9]{0,8}$',
        false
      )
  ) THEN
    RAISE EXCEPTION 'Existing behaviour review intents require scope validation before backfill';
  END IF;
END $$;
INSERT INTO "BehaviourReviewRequest"
  ("id", "tenantId", "childId", "behaviourEntryId", "kind", "stage", "policyVersion", "requestedAt")
SELECT DISTINCT ON (e."id", o.payload->>'stage', o.payload->>'reviewKind')
  pg_catalog.gen_random_uuid()::text, e."tenantId", e."childId", e."id",
  o.payload->>'reviewKind', (o.payload->>'stage')::integer,
  (o.payload->>'demeritPolicyVersion')::integer, o."createdAt"
FROM "OutboxEvent" o
JOIN "BehaviourEntry" e ON e."id" = o."aggregateId"
JOIN "Tenant" t ON t."id" = e."tenantId" AND t."orgId" = o."orgId"
WHERE o."eventType" = 'behaviour.review-requested'
  AND o."aggregateType" = 'BEHAVIOUR_ENTRY'
  AND o.payload->>'behaviourEntryId' = e."id"
  AND o.payload->>'tenantId' = e."tenantId"
  AND o.payload->>'childId' = e."childId"
  AND o.payload->>'orgId' = o."orgId"
  AND o.payload->>'reviewKind' IN ('SITE', 'HEAD')
  AND o.payload->>'stage' IN ('1', '2', '3')
  AND o.payload->>'demeritPolicyVersion' ~ '^[1-9][0-9]{0,8}$'
ORDER BY e."id", o.payload->>'stage', o.payload->>'reviewKind', o."createdAt", o."id";
SET row_security = on;

CREATE TRIGGER "BehaviourReviewRequest_immutable"
BEFORE UPDATE OR DELETE ON "BehaviourReviewRequest"
FOR EACH ROW EXECUTE FUNCTION app.reject_ace_record_mutation();

ALTER TABLE "BehaviourReviewRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BehaviourReviewRequest" FORCE ROW LEVEL SECURITY;
CREATE POLICY "BehaviourReviewRequest_tenant_rls" ON "BehaviourReviewRequest"
  USING (app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id())
  WITH CHECK (app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id());
REVOKE ALL PRIVILEGES ON TABLE "BehaviourReviewRequest" FROM PUBLIC;
DO $$ BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    REVOKE ALL PRIVILEGES ON TABLE "BehaviourReviewRequest" FROM anon;
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    REVOKE ALL PRIVILEGES ON TABLE "BehaviourReviewRequest" FROM authenticated;
  END IF;
END $$;
