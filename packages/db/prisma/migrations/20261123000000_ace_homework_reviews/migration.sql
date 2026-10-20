ALTER TYPE "AceHomeworkSubmissionStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';

CREATE TYPE "AceHomeworkReviewDecision" AS ENUM ('RETURNED', 'COMPLETED');

CREATE TABLE "AceHomeworkReview" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "reviewedByUserId" TEXT NOT NULL,
  "releasedByUserId" TEXT,
  "decision" "AceHomeworkReviewDecision" NOT NULL,
  "studentFeedback" VARCHAR(2000) NOT NULL,
  "staffNote" VARCHAR(2000) NOT NULL,
  "idempotencyKey" VARCHAR(80) NOT NULL,
  "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedAt" TIMESTAMP(3),
  CONSTRAINT "AceHomeworkReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AceHomeworkReview_release_check" CHECK (
    ("releasedAt" IS NULL AND "releasedByUserId" IS NULL)
    OR ("releasedAt" IS NOT NULL AND "releasedByUserId" IS NOT NULL AND "decision" = 'COMPLETED')
  )
);

CREATE UNIQUE INDEX "AceHomeworkReview_id_tenantId_key"
  ON "AceHomeworkReview"("id", "tenantId");
CREATE UNIQUE INDEX "AceHomeworkReview_versionId_tenantId_key"
  ON "AceHomeworkReview"("versionId", "tenantId");
CREATE INDEX "AceHomeworkReview_tenantId_releasedAt_idx"
  ON "AceHomeworkReview"("tenantId", "releasedAt");

ALTER TABLE "AceHomeworkReview" ADD CONSTRAINT "AceHomeworkReview_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AceHomeworkReview" ADD CONSTRAINT "AceHomeworkReview_versionId_tenantId_fkey"
  FOREIGN KEY ("versionId", "tenantId") REFERENCES "AceHomeworkSubmissionVersion"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AceHomeworkReview" ADD CONSTRAINT "AceHomeworkReview_reviewedByUserId_fkey"
  FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AceHomeworkReview" ADD CONSTRAINT "AceHomeworkReview_releasedByUserId_fkey"
  FOREIGN KEY ("releasedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION app.assert_ace_homework_review_release()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."releasedAt" IS NOT NULL
     OR OLD."decision" <> 'COMPLETED'
     OR NEW."releasedAt" IS NULL
     OR NEW."releasedByUserId" IS NULL
     OR ROW(NEW."id", NEW."tenantId", NEW."versionId", NEW."reviewedByUserId",
            NEW."decision", NEW."studentFeedback", NEW."staffNote",
            NEW."idempotencyKey", NEW."reviewedAt")
        IS DISTINCT FROM
        ROW(OLD."id", OLD."tenantId", OLD."versionId", OLD."reviewedByUserId",
            OLD."decision", OLD."studentFeedback", OLD."staffNote",
            OLD."idempotencyKey", OLD."reviewedAt")
  THEN
    RAISE EXCEPTION 'homework review is immutable after decision'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE outbox_schema text;
BEGIN
  SELECT n.nspname INTO outbox_schema
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relname = 'OutboxEvent' AND c.relkind = 'r'
  ORDER BY CASE WHEN n.nspname = 'app' THEN 0 ELSE 1 END
  LIMIT 1;
  EXECUTE pg_catalog.format($definition$
    CREATE FUNCTION app.list_due_homework_email_org_ids()
    RETURNS TABLE ("orgId" text)
    LANGUAGE sql SECURITY DEFINER SET search_path = ''
    AS $function$
      SELECT event."orgId"
      FROM %I."OutboxEvent" event
      WHERE event."eventType" = 'ace.homework.email'
        AND event."status"::text = 'PENDING'
        AND event."nextAttemptAt" <= CURRENT_TIMESTAMP
      GROUP BY event."orgId"
      ORDER BY MIN(event."createdAt"), event."orgId"
    $function$;
  $definition$, outbox_schema);
END;
$$;
REVOKE ALL ON FUNCTION app.list_due_homework_email_org_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_due_homework_email_org_ids() TO CURRENT_USER;
REVOKE ALL ON FUNCTION app.assert_ace_homework_review_release() FROM PUBLIC;
CREATE TRIGGER "AceHomeworkReview_release_only"
BEFORE UPDATE ON "AceHomeworkReview"
FOR EACH ROW EXECUTE FUNCTION app.assert_ace_homework_review_release();
CREATE TRIGGER "AceHomeworkReview_reject_delete"
BEFORE DELETE ON "AceHomeworkReview"
FOR EACH ROW EXECUTE FUNCTION app.reject_forward_state_delete();

ALTER TABLE "AceHomeworkReview" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AceHomeworkReview" FORCE ROW LEVEL SECURITY;
CREATE POLICY "AceHomeworkReview_tenant_rls" ON "AceHomeworkReview"
  USING (app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id())
  WITH CHECK (app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id());
REVOKE ALL PRIVILEGES ON TABLE "AceHomeworkReview" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    REVOKE ALL PRIVILEGES ON TABLE "AceHomeworkReview" FROM anon;
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    REVOKE ALL PRIVILEGES ON TABLE "AceHomeworkReview" FROM authenticated;
  END IF;
END;
$$;
