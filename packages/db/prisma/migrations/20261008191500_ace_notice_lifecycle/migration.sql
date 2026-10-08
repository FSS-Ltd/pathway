-- F21 notice tables live in app even when legacy identity tables live in public.
SET search_path TO app, public;

ALTER TABLE app."AceNotice"
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "withdrawnAt" TIMESTAMP(3);

ALTER TABLE app."AceNotice"
  ADD CONSTRAINT "AceNotice_expiry_after_publication_check"
    CHECK ("expiresAt" IS NULL OR "publishedAt" IS NULL OR "expiresAt" > "publishedAt"),
  ADD CONSTRAINT "AceNotice_withdrawal_after_publication_check"
    CHECK ("withdrawnAt" IS NULL OR (
      "publishedAt" IS NOT NULL AND "withdrawnAt" >= "publishedAt"
    ));

CREATE INDEX "AceNotice_tenantId_withdrawnAt_publishedAt_idx"
  ON app."AceNotice"("tenantId", "withdrawnAt", "publishedAt" DESC);

CREATE FUNCTION app.assert_ace_notice_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."withdrawnAt" IS NOT NULL THEN
      RAISE EXCEPTION 'Draft notices cannot be withdrawn'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."publishedAt" IS NOT NULL AND (
    NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."createdByUserId" IS DISTINCT FROM OLD."createdByUserId"
    OR NEW."title" IS DISTINCT FROM OLD."title"
    OR NEW."body" IS DISTINCT FROM OLD."body"
    OR NEW."audience" IS DISTINCT FROM OLD."audience"
    OR NEW."publishedAt" IS DISTINCT FROM OLD."publishedAt"
    OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  ) THEN
    RAISE EXCEPTION 'Published notice content is immutable'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF OLD."withdrawnAt" IS NOT NULL
    AND NEW."withdrawnAt" IS DISTINCT FROM OLD."withdrawnAt"
  THEN
    RAISE EXCEPTION 'Notice withdrawal is final'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF OLD."publishedAt" IS NULL AND NEW."publishedAt" IS NOT NULL
    AND NEW."expiresAt" IS NOT NULL
    AND NEW."expiresAt" <= pg_catalog.clock_timestamp()
  THEN
    RAISE EXCEPTION 'Notice expiry must be in the future at publication'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW."withdrawnAt" IS NOT NULL AND NEW."publishedAt" IS NULL THEN
    RAISE EXCEPTION 'Draft notices cannot be withdrawn'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION app.assert_ace_notice_attachment_draft()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  notice_published_at timestamp(3);
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."noticeId" IS DISTINCT FROM OLD."noticeId"
  ) THEN
    RAISE EXCEPTION 'Notice attachments cannot move between notices'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  SELECT notice."publishedAt"
  INTO notice_published_at
  FROM app."AceNotice" notice
  WHERE notice."id" = CASE WHEN TG_OP = 'DELETE' THEN OLD."noticeId" ELSE NEW."noticeId" END
    AND notice."tenantId" = CASE WHEN TG_OP = 'DELETE' THEN OLD."tenantId" ELSE NEW."tenantId" END
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Notice attachment requires a notice in the selected tenant'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF notice_published_at IS NOT NULL THEN
    RAISE EXCEPTION 'Published notice attachments are immutable'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION app.assert_ace_notice_active_read()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  notice_expires_at timestamp(3);
  notice_withdrawn_at timestamp(3);
  needs_active_check boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    needs_active_check := NEW."readAt" IS NOT NULL;
  ELSE
    IF OLD."readAt" IS NOT NULL
      AND NEW."readAt" IS DISTINCT FROM OLD."readAt"
    THEN
      RAISE EXCEPTION 'Notice read time is write-once'
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    needs_active_check := NEW."readAt" IS NOT NULL AND OLD."readAt" IS NULL;
  END IF;

  IF needs_active_check THEN
    SELECT notice."expiresAt", notice."withdrawnAt"
    INTO notice_expires_at, notice_withdrawn_at
    FROM app."AceNoticeAudienceMember" audience
    JOIN app."AceNotice" notice
      ON notice."id" = audience."noticeId"
      AND notice."tenantId" = audience."tenantId"
    WHERE audience."id" = NEW."audienceMemberId"
      AND audience."tenantId" = NEW."tenantId";

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Notice receipt requires a current audience member'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF notice_withdrawn_at IS NOT NULL
      OR (notice_expires_at IS NOT NULL
        AND notice_expires_at <= pg_catalog.clock_timestamp())
    THEN
      RAISE EXCEPTION 'Inactive notices cannot gain read receipts'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.assert_ace_notice_lifecycle() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.assert_ace_notice_attachment_draft() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.assert_ace_notice_active_read() FROM PUBLIC;

CREATE TRIGGER "AceNotice_validate_lifecycle"
BEFORE INSERT OR UPDATE ON app."AceNotice"
FOR EACH ROW EXECUTE FUNCTION app.assert_ace_notice_lifecycle();

CREATE TRIGGER "AceNoticeAttachment_require_draft"
BEFORE INSERT OR UPDATE OR DELETE ON app."AceNoticeAttachment"
FOR EACH ROW EXECUTE FUNCTION app.assert_ace_notice_attachment_draft();

CREATE TRIGGER "AceNoticeReceipt_active_read_guard"
BEFORE INSERT OR UPDATE OF "readAt" ON app."AceNoticeReceipt"
FOR EACH ROW EXECUTE FUNCTION app.assert_ace_notice_active_read();
