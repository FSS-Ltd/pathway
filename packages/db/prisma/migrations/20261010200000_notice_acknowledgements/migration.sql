ALTER TABLE app."AceNotice"
  ADD COLUMN "requiresAcknowledgement" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE app."AceNoticeReceipt"
  ADD COLUMN "acknowledgedAt" TIMESTAMP(3),
  ADD CONSTRAINT "AceNoticeReceipt_ack_requires_read_check"
    CHECK ("acknowledgedAt" IS NULL OR (
      "readAt" IS NOT NULL AND "acknowledgedAt" >= "readAt"
    ));

CREATE OR REPLACE VIEW public."AceNotice" WITH (security_invoker = true)
  AS SELECT * FROM app."AceNotice";
CREATE OR REPLACE VIEW public."AceNoticeReceipt" WITH (security_invoker = true)
  AS SELECT * FROM app."AceNoticeReceipt";

CREATE FUNCTION app.assert_ace_notice_acknowledgement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  notice_requires_ack boolean;
  notice_expires_at timestamp(3);
  notice_withdrawn_at timestamp(3);
  needs_ack_check boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    needs_ack_check := NEW."acknowledgedAt" IS NOT NULL;
  ELSE
    IF OLD."acknowledgedAt" IS NOT NULL
      AND NEW."acknowledgedAt" IS DISTINCT FROM OLD."acknowledgedAt"
    THEN
      RAISE EXCEPTION 'Notice acknowledgement is write-once'
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    needs_ack_check := NEW."acknowledgedAt" IS NOT NULL
      AND OLD."acknowledgedAt" IS NULL;
  END IF;

  IF needs_ack_check THEN
    SELECT notice."requiresAcknowledgement", notice."expiresAt", notice."withdrawnAt"
    INTO notice_requires_ack, notice_expires_at, notice_withdrawn_at
    FROM app."AceNoticeAudienceMember" audience
    JOIN app."AceNotice" notice
      ON notice."id" = audience."noticeId"
      AND notice."tenantId" = audience."tenantId"
    WHERE audience."id" = NEW."audienceMemberId"
      AND audience."tenantId" = NEW."tenantId";

    IF NOT FOUND OR NOT notice_requires_ack
      OR notice_withdrawn_at IS NOT NULL
      OR (notice_expires_at IS NOT NULL
        AND notice_expires_at <= pg_catalog.clock_timestamp())
    THEN
      RAISE EXCEPTION 'Notice cannot be acknowledged'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.assert_ace_notice_acknowledgement() FROM PUBLIC;
CREATE TRIGGER "AceNoticeReceipt_acknowledgement_guard"
  BEFORE INSERT OR UPDATE OF "acknowledgedAt" ON app."AceNoticeReceipt"
  FOR EACH ROW EXECUTE FUNCTION app.assert_ace_notice_acknowledgement();

CREATE FUNCTION app.assert_ace_notice_ack_setting()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD."publishedAt" IS NOT NULL
    AND NEW."requiresAcknowledgement" IS DISTINCT FROM OLD."requiresAcknowledgement"
  THEN
    RAISE EXCEPTION 'Published notice acknowledgement setting is immutable'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.assert_ace_notice_ack_setting() FROM PUBLIC;
CREATE TRIGGER "AceNotice_ack_setting_guard"
  BEFORE UPDATE OF "requiresAcknowledgement" ON app."AceNotice"
  FOR EACH ROW EXECUTE FUNCTION app.assert_ace_notice_ack_setting();
