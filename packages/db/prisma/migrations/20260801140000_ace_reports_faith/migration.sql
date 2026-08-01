-- ACE report publication storage. Staff-only source and review text remains
-- separate from the immutable family payload released by maker/checker approval.

CREATE TYPE "AceReportDraftStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED');
CREATE TYPE "AceReportReviewDecision" AS ENUM ('APPROVED', 'REJECTED');

CREATE TABLE "AceTermReport" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "academicPeriodId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AceTermReport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AceTermReport_id_tenant_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "AceTermReport_target_key"
    UNIQUE ("tenantId", "childId", "academicPeriodId"),
  CONSTRAINT "AceTermReport_tenant_fk"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceTermReport_child_tenant_fk"
    FOREIGN KEY ("childId", "tenantId") REFERENCES "Child"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceTermReport_period_tenant_fk"
    FOREIGN KEY ("academicPeriodId", "tenantId")
    REFERENCES "AcademicPeriod"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "AceReportCompilation" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "sourceEncrypted" TEXT NOT NULL,
  "compiledByUserId" TEXT NOT NULL,
  "compiledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AceReportCompilation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AceReportCompilation_id_tenant_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "AceReportCompilation_scope_key"
    UNIQUE ("id", "tenantId", "reportId"),
  CONSTRAINT "AceReportCompilation_tenant_fk"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceReportCompilation_report_tenant_fk"
    FOREIGN KEY ("reportId", "tenantId")
    REFERENCES "AceTermReport"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceReportCompilation_actor_fk"
    FOREIGN KEY ("compiledByUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "AceReportDraft" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "compilationId" TEXT NOT NULL,
  "familyPayload" JSONB NOT NULL,
  "staffNotesEncrypted" TEXT,
  "status" "AceReportDraftStatus" NOT NULL DEFAULT 'DRAFT',
  "authorUserId" TEXT NOT NULL,
  "submittedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AceReportDraft_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AceReportDraft_id_tenant_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "AceReportDraft_scope_key" UNIQUE ("id", "tenantId", "reportId"),
  CONSTRAINT "AceReportDraft_status_metadata_check" CHECK (
    ("status" = 'DRAFT' AND "submittedAt" IS NULL AND "approvedAt" IS NULL)
    OR ("status" = 'IN_REVIEW' AND "submittedAt" IS NOT NULL AND "approvedAt" IS NULL)
    OR ("status" = 'APPROVED' AND "submittedAt" IS NOT NULL AND "approvedAt" IS NOT NULL)
  ),
  CONSTRAINT "AceReportDraft_tenant_fk"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceReportDraft_report_tenant_fk"
    FOREIGN KEY ("reportId", "tenantId")
    REFERENCES "AceTermReport"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceReportDraft_compilation_scope_fk"
    FOREIGN KEY ("compilationId", "tenantId", "reportId")
    REFERENCES "AceReportCompilation"("id", "tenantId", "reportId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceReportDraft_author_fk"
    FOREIGN KEY ("authorUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "AceReportReview" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "draftId" TEXT NOT NULL,
  "reviewerUserId" TEXT NOT NULL,
  "decision" "AceReportReviewDecision" NOT NULL,
  "reviewNotesEncrypted" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AceReportReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AceReportReview_id_tenant_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "AceReportReview_tenant_fk"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceReportReview_draft_tenant_fk"
    FOREIGN KEY ("draftId", "tenantId")
    REFERENCES "AceReportDraft"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceReportReview_reviewer_fk"
    FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "AceTermReportVersion" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "sourceDraftId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "familyPayload" JSONB NOT NULL,
  "privateDocumentKey" TEXT,
  "guardianVisibleAt" TIMESTAMP(3) NOT NULL,
  "studentVisibleAt" TIMESTAMP(3),
  "supersedesVersionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AceTermReportVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AceTermReportVersion_id_tenant_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "AceTermReportVersion_scope_key" UNIQUE ("id", "tenantId", "reportId"),
  CONSTRAINT "AceTermReportVersion_source_draft_key"
    UNIQUE ("sourceDraftId", "tenantId", "reportId"),
  CONSTRAINT "AceTermReportVersion_report_number_key" UNIQUE ("reportId", "versionNumber"),
  CONSTRAINT "AceTermReportVersion_supersedes_key"
    UNIQUE ("supersedesVersionId", "tenantId", "reportId"),
  CONSTRAINT "AceTermReportVersion_positive_number_check" CHECK ("versionNumber" > 0),
  CONSTRAINT "AceTermReportVersion_document_key_check" CHECK (
    "privateDocumentKey" IS NULL
    OR "privateDocumentKey" =
      'tenants/' || "tenantId" || '/reports/' || "id" || '.pdf'
  ),
  CONSTRAINT "AceTermReportVersion_release_order_check" CHECK (
    "studentVisibleAt" IS NULL OR "studentVisibleAt" >= "guardianVisibleAt"
  ),
  CONSTRAINT "AceTermReportVersion_tenant_fk"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceTermReportVersion_report_tenant_fk"
    FOREIGN KEY ("reportId", "tenantId")
    REFERENCES "AceTermReport"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceTermReportVersion_source_draft_scope_fk"
    FOREIGN KEY ("sourceDraftId", "tenantId", "reportId")
    REFERENCES "AceReportDraft"("id", "tenantId", "reportId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceTermReportVersion_supersedes_scope_fk"
    FOREIGN KEY ("supersedesVersionId", "tenantId", "reportId")
    REFERENCES "AceTermReportVersion"("id", "tenantId", "reportId")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "AceTermReport_tenant_period_child_idx"
  ON "AceTermReport"("tenantId", "academicPeriodId", "childId");
CREATE INDEX "AceReportCompilation_tenant_report_compiled_idx"
  ON "AceReportCompilation"("tenantId", "reportId", "compiledAt");
CREATE INDEX "AceReportDraft_tenant_report_status_created_idx"
  ON "AceReportDraft"("tenantId", "reportId", "status", "createdAt");
CREATE INDEX "AceReportDraft_tenant_author_idx"
  ON "AceReportDraft"("tenantId", "authorUserId");
CREATE INDEX "AceReportReview_tenant_draft_created_idx"
  ON "AceReportReview"("tenantId", "draftId", "createdAt");
CREATE INDEX "AceReportReview_tenant_reviewer_idx"
  ON "AceReportReview"("tenantId", "reviewerUserId");
CREATE INDEX "AceTermReportVersion_tenant_report_guardian_idx"
  ON "AceTermReportVersion"("tenantId", "reportId", "guardianVisibleAt");

-- Global user foreign keys establish identity. This guard additionally proves
-- that every report actor belongs to the row's tenant through the current or
-- equivalent legacy membership model, independently of caller row visibility.
CREATE FUNCTION app.require_ace_report_actor_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_user_id TEXT;
BEGIN
  actor_user_id := pg_catalog.to_jsonb(NEW) ->> TG_ARGV[0];

  IF actor_user_id IS NULL OR NOT (
    EXISTS (
      SELECT 1
      FROM app."SiteMembership"
      WHERE "tenantId" = NEW."tenantId"
        AND "userId" = actor_user_id
    )
    OR EXISTS (
      SELECT 1
      FROM app."UserTenantRole"
      WHERE "tenantId" = NEW."tenantId"
        AND "userId" = actor_user_id
    )
  ) THEN
    RAISE EXCEPTION 'ACE report actor must belong to the tenant'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Faith content publication storage. Drafts remain editable until publication;
-- published content and its selected audience are immutable snapshots.
CREATE TYPE "FaithContentDraftStatus" AS ENUM ('DRAFT', 'PUBLISHED');
CREATE TYPE "FaithContentAudienceType" AS ENUM ('ALL_ACTIVE_STUDENTS', 'AGE_BAND');

CREATE TABLE "FaithAgeBand" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "minimumAge" INTEGER NOT NULL,
  "maximumAge" INTEGER NOT NULL,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FaithAgeBand_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FaithAgeBand_id_tenant_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "FaithAgeBand_tenant_name_key" UNIQUE ("tenantId", "name"),
  CONSTRAINT "FaithAgeBand_range_check" CHECK (
    "minimumAge" >= 0 AND "maximumAge" >= "minimumAge"
  ),
  CONSTRAINT "FaithAgeBand_tenant_fk"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "FaithContent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FaithContent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FaithContent_id_tenant_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "FaithContent_tenant_fk"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "FaithContentDraft" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "faithContentId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "contentPayload" JSONB NOT NULL,
  "status" "FaithContentDraftStatus" NOT NULL DEFAULT 'DRAFT',
  "authorUserId" TEXT NOT NULL,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FaithContentDraft_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FaithContentDraft_id_tenant_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "FaithContentDraft_scope_key"
    UNIQUE ("id", "tenantId", "faithContentId"),
  CONSTRAINT "FaithContentDraft_status_check" CHECK (
    ("status" = 'DRAFT' AND "publishedAt" IS NULL)
    OR ("status" = 'PUBLISHED' AND "publishedAt" IS NOT NULL)
  ),
  CONSTRAINT "FaithContentDraft_tenant_fk"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FaithContentDraft_content_tenant_fk"
    FOREIGN KEY ("faithContentId", "tenantId")
    REFERENCES "FaithContent"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FaithContentDraft_author_fk"
    FOREIGN KEY ("authorUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "FaithContentVersion" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "faithContentId" TEXT NOT NULL,
  "sourceDraftId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "contentPayload" JSONB NOT NULL,
  "publishedAt" TIMESTAMP(3) NOT NULL,
  "supersedesVersionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FaithContentVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FaithContentVersion_id_tenant_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "FaithContentVersion_scope_key"
    UNIQUE ("id", "tenantId", "faithContentId"),
  CONSTRAINT "FaithContentVersion_source_draft_key"
    UNIQUE ("sourceDraftId", "tenantId", "faithContentId"),
  CONSTRAINT "FaithContentVersion_supersedes_key"
    UNIQUE ("supersedesVersionId", "tenantId", "faithContentId"),
  CONSTRAINT "FaithContentVersion_content_number_key"
    UNIQUE ("faithContentId", "versionNumber"),
  CONSTRAINT "FaithContentVersion_positive_number_check"
    CHECK ("versionNumber" > 0),
  CONSTRAINT "FaithContentVersion_tenant_fk"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FaithContentVersion_content_tenant_fk"
    FOREIGN KEY ("faithContentId", "tenantId")
    REFERENCES "FaithContent"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FaithContentVersion_source_draft_scope_fk"
    FOREIGN KEY ("sourceDraftId", "tenantId", "faithContentId")
    REFERENCES "FaithContentDraft"("id", "tenantId", "faithContentId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FaithContentVersion_supersedes_scope_fk"
    FOREIGN KEY ("supersedesVersionId", "tenantId", "faithContentId")
    REFERENCES "FaithContentVersion"("id", "tenantId", "faithContentId")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "FaithContentAudience" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "faithContentVersionId" TEXT NOT NULL,
  "type" "FaithContentAudienceType" NOT NULL,
  "sourceAgeBandId" TEXT,
  "ageBandName" TEXT,
  "minimumAge" INTEGER,
  "maximumAge" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FaithContentAudience_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FaithContentAudience_id_tenant_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "FaithContentAudience_band_key"
    UNIQUE ("tenantId", "faithContentVersionId", "sourceAgeBandId"),
  CONSTRAINT "FaithContentAudience_shape_check" CHECK (
    (
      "type" = 'ALL_ACTIVE_STUDENTS'
      AND "sourceAgeBandId" IS NULL
      AND "ageBandName" IS NULL
      AND "minimumAge" IS NULL
      AND "maximumAge" IS NULL
    )
    OR (
      "type" = 'AGE_BAND'
      AND "sourceAgeBandId" IS NOT NULL
      AND "ageBandName" IS NOT NULL
      AND "minimumAge" IS NOT NULL
      AND "maximumAge" IS NOT NULL
      AND "minimumAge" >= 0
      AND "maximumAge" >= "minimumAge"
    )
  ),
  CONSTRAINT "FaithContentAudience_tenant_fk"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FaithContentAudience_version_tenant_fk"
    FOREIGN KEY ("faithContentVersionId", "tenantId")
    REFERENCES "FaithContentVersion"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FaithContentAudience_band_tenant_fk"
    FOREIGN KEY ("sourceAgeBandId", "tenantId")
    REFERENCES "FaithAgeBand"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "FaithReadReceipt" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "faithContentVersionId" TEXT NOT NULL,
  "studentIdentityId" TEXT NOT NULL,
  "readAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FaithReadReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FaithReadReceipt_id_tenant_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "FaithReadReceipt_student_version_key"
    UNIQUE ("tenantId", "faithContentVersionId", "studentIdentityId"),
  CONSTRAINT "FaithReadReceipt_tenant_fk"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FaithReadReceipt_version_tenant_fk"
    FOREIGN KEY ("faithContentVersionId", "tenantId")
    REFERENCES "FaithContentVersion"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FaithReadReceipt_student_tenant_fk"
    FOREIGN KEY ("studentIdentityId", "tenantId")
    REFERENCES "StudentIdentity"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "FaithReflection" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "faithContentVersionId" TEXT NOT NULL,
  "studentIdentityId" TEXT NOT NULL,
  "reflectionEncrypted" TEXT NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL,
  "guardianReleasedAt" TIMESTAMP(3),
  "releasedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FaithReflection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FaithReflection_id_tenant_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "FaithReflection_student_version_key"
    UNIQUE ("tenantId", "faithContentVersionId", "studentIdentityId"),
  CONSTRAINT "FaithReflection_release_metadata_check" CHECK (
    ("guardianReleasedAt" IS NULL AND "releasedByUserId" IS NULL)
    OR ("guardianReleasedAt" IS NOT NULL AND "releasedByUserId" IS NOT NULL)
  ),
  CONSTRAINT "FaithReflection_tenant_fk"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FaithReflection_version_tenant_fk"
    FOREIGN KEY ("faithContentVersionId", "tenantId")
    REFERENCES "FaithContentVersion"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FaithReflection_student_tenant_fk"
    FOREIGN KEY ("studentIdentityId", "tenantId")
    REFERENCES "StudentIdentity"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FaithReflection_released_by_fk"
    FOREIGN KEY ("releasedByUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "FaithContentAudience_all_students_key"
  ON "FaithContentAudience"("tenantId", "faithContentVersionId")
  WHERE "type" = 'ALL_ACTIVE_STUDENTS';
CREATE INDEX "FaithAgeBand_tenant_archived_idx"
  ON "FaithAgeBand"("tenantId", "archivedAt");
CREATE INDEX "FaithContent_tenant_created_idx"
  ON "FaithContent"("tenantId", "createdAt");
CREATE INDEX "FaithContentDraft_tenant_content_status_idx"
  ON "FaithContentDraft"("tenantId", "faithContentId", "status", "createdAt");
CREATE INDEX "FaithContentDraft_tenant_author_idx"
  ON "FaithContentDraft"("tenantId", "authorUserId");
CREATE INDEX "FaithContentVersion_tenant_content_published_idx"
  ON "FaithContentVersion"("tenantId", "faithContentId", "publishedAt");
CREATE INDEX "FaithContentAudience_tenant_version_idx"
  ON "FaithContentAudience"("tenantId", "faithContentVersionId");
CREATE INDEX "FaithReadReceipt_tenant_version_read_idx"
  ON "FaithReadReceipt"("tenantId", "faithContentVersionId", "readAt");
CREATE INDEX "FaithReadReceipt_tenant_student_idx"
  ON "FaithReadReceipt"("tenantId", "studentIdentityId");
CREATE INDEX "FaithReflection_tenant_version_submitted_idx"
  ON "FaithReflection"("tenantId", "faithContentVersionId", "submittedAt");
CREATE INDEX "FaithReflection_tenant_student_idx"
  ON "FaithReflection"("tenantId", "studentIdentityId");
CREATE INDEX "FaithReflection_tenant_release_idx"
  ON "FaithReflection"("tenantId", "guardianReleasedAt");

CREATE FUNCTION app.require_faith_actor_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_user_id TEXT;
BEGIN
  actor_user_id := pg_catalog.to_jsonb(NEW) ->> TG_ARGV[0];
  IF actor_user_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT (
    EXISTS (
      SELECT 1
      FROM app."SiteMembership"
      WHERE "tenantId" = NEW."tenantId" AND "userId" = actor_user_id
    )
    OR EXISTS (
      SELECT 1
      FROM app."UserTenantRole"
      WHERE "tenantId" = NEW."tenantId" AND "userId" = actor_user_id
    )
  ) THEN
    RAISE EXCEPTION 'Faith actor must belong to the tenant'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION app.guard_faith_content_draft_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" = 'PUBLISHED' THEN
      RAISE EXCEPTION 'Published Faith drafts are immutable'
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."faithContentId" IS DISTINCT FROM OLD."faithContentId"
    OR NEW."authorUserId" IS DISTINCT FROM OLD."authorUserId"
  THEN
    RAISE EXCEPTION 'Faith draft tenant, content, and author are immutable'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF OLD."status" = 'PUBLISHED' THEN
    RAISE EXCEPTION 'Published Faith drafts are immutable'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF NEW."status" = 'PUBLISHED' AND NOT (
    pg_trigger_depth() = 2
    AND EXISTS (
      SELECT 1
      FROM app."FaithContentVersion"
      WHERE "sourceDraftId" = OLD."id"
        AND "tenantId" = OLD."tenantId"
        AND "faithContentId" = OLD."faithContentId"
    )
    AND NEW."title" IS NOT DISTINCT FROM OLD."title"
    AND NEW."contentPayload" IS NOT DISTINCT FROM OLD."contentPayload"
  ) THEN
    RAISE EXCEPTION 'Faith drafts can be published only by a content version'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION app.prepare_faith_content_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  draft_row RECORD;
  previous_version_id TEXT;
  next_version_number INTEGER;
BEGIN
  PERFORM 1
  FROM app."FaithContent"
  WHERE "id" = NEW."faithContentId" AND "tenantId" = NEW."tenantId"
  FOR UPDATE;

  SELECT * INTO draft_row
  FROM app."FaithContentDraft"
  WHERE "id" = NEW."sourceDraftId"
    AND "tenantId" = NEW."tenantId"
    AND "faithContentId" = NEW."faithContentId"
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Faith source draft does not exist in this content scope'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF draft_row."status" <> 'DRAFT'
    OR NEW."title" IS DISTINCT FROM draft_row."title"
    OR NEW."contentPayload" IS DISTINCT FROM draft_row."contentPayload"
  THEN
    RAISE EXCEPTION 'Faith publication must snapshot an unpublished draft'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT "id", "versionNumber"
  INTO previous_version_id, next_version_number
  FROM app."FaithContentVersion"
  WHERE "faithContentId" = NEW."faithContentId"
    AND "tenantId" = NEW."tenantId"
  ORDER BY "versionNumber" DESC
  LIMIT 1;
  next_version_number := COALESCE(next_version_number, 0) + 1;
  IF NEW."versionNumber" <> next_version_number
    OR NEW."supersedesVersionId" IS DISTINCT FROM previous_version_id
  THEN
    RAISE EXCEPTION 'Faith versions must form one ordered supersession chain'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION app.mark_faith_content_draft_published()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE app."FaithContentDraft"
  SET
    "status" = 'PUBLISHED',
    "publishedAt" = NEW."publishedAt",
    "updatedAt" = CURRENT_TIMESTAMP
  WHERE "id" = NEW."sourceDraftId" AND "tenantId" = NEW."tenantId";
  RETURN NEW;
END;
$$;

CREATE FUNCTION app.guard_faith_content_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Published Faith content versions are immutable'
    USING ERRCODE = 'object_not_in_prerequisite_state';
END;
$$;

CREATE FUNCTION app.guard_faith_content_audience_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Published Faith audiences are immutable'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM app."FaithContentVersion"
    WHERE "id" = NEW."faithContentVersionId"
      AND "tenantId" = NEW."tenantId"
      AND "xmin" = pg_catalog.pg_current_xact_id()::xid
  ) THEN
    RAISE EXCEPTION 'Faith audiences must be created atomically with publication'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION app.validate_faith_content_audience()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  version_id TEXT;
  tenant_id TEXT;
  audience_count INTEGER;
  all_students_count INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'FaithContentVersion' THEN
    version_id := NEW."id";
    tenant_id := NEW."tenantId";
  ELSIF TG_OP = 'DELETE' THEN
    version_id := OLD."faithContentVersionId";
    tenant_id := OLD."tenantId";
  ELSE
    version_id := NEW."faithContentVersionId";
    tenant_id := NEW."tenantId";
  END IF;

  PERFORM 1
  FROM app."FaithContentVersion"
  WHERE "id" = version_id AND "tenantId" = tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE "type" = 'ALL_ACTIVE_STUDENTS')::integer
  INTO audience_count, all_students_count
  FROM app."FaithContentAudience"
  WHERE "faithContentVersionId" = version_id AND "tenantId" = tenant_id;

  IF audience_count = 0 THEN
    RAISE EXCEPTION 'Published Faith content requires an audience'
      USING ERRCODE = 'check_violation';
  END IF;
  IF all_students_count > 0 AND audience_count <> 1 THEN
    RAISE EXCEPTION 'All-active-students cannot be combined with age bands'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM app."FaithContentAudience" AS audience
    LEFT JOIN app."FaithAgeBand" AS age_band
      ON age_band."id" = audience."sourceAgeBandId"
      AND age_band."tenantId" = audience."tenantId"
    WHERE audience."faithContentVersionId" = version_id
      AND audience."tenantId" = tenant_id
      AND audience."type" = 'AGE_BAND'
      AND (
        age_band."id" IS NULL
        OR age_band."archivedAt" IS NOT NULL
        OR audience."ageBandName" IS DISTINCT FROM age_band."name"
        OR audience."minimumAge" IS DISTINCT FROM age_band."minimumAge"
        OR audience."maximumAge" IS DISTINCT FROM age_band."maximumAge"
      )
  ) THEN
    RAISE EXCEPTION 'Faith age-band snapshot must match an active source band'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE FUNCTION app.reject_faith_read_receipt_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Faith read receipts are immutable'
    USING ERRCODE = 'object_not_in_prerequisite_state';
END;
$$;

CREATE FUNCTION app.guard_faith_reflection_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."guardianReleasedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'Released Faith reflections are immutable'
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."faithContentVersionId" IS DISTINCT FROM OLD."faithContentVersionId"
    OR NEW."studentIdentityId" IS DISTINCT FROM OLD."studentIdentityId"
    OR NEW."submittedAt" IS DISTINCT FROM OLD."submittedAt"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'Faith reflection identity target is immutable'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF OLD."guardianReleasedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Released Faith reflections are immutable'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF NEW."guardianReleasedAt" IS NOT NULL
    AND NEW."reflectionEncrypted" IS DISTINCT FROM OLD."reflectionEncrypted"
  THEN
    RAISE EXCEPTION 'Faith reflection content and release must change separately'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.require_faith_actor_membership() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.guard_faith_content_draft_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.prepare_faith_content_version() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.mark_faith_content_draft_published() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.guard_faith_content_version_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.guard_faith_content_audience_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.validate_faith_content_audience() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.reject_faith_read_receipt_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.guard_faith_reflection_mutation() FROM PUBLIC;

CREATE TRIGGER "FaithContentDraft_require_actor_membership"
BEFORE INSERT OR UPDATE OF "tenantId", "authorUserId"
ON "FaithContentDraft"
FOR EACH ROW EXECUTE FUNCTION app.require_faith_actor_membership('authorUserId');

CREATE TRIGGER "FaithReflection_require_release_actor_membership"
BEFORE INSERT OR UPDATE OF "tenantId", "releasedByUserId"
ON "FaithReflection"
FOR EACH ROW EXECUTE FUNCTION app.require_faith_actor_membership('releasedByUserId');

CREATE TRIGGER "FaithContentDraft_guard_mutation"
BEFORE UPDATE OR DELETE ON "FaithContentDraft"
FOR EACH ROW EXECUTE FUNCTION app.guard_faith_content_draft_mutation();

CREATE TRIGGER "FaithContentVersion_prepare_publication"
BEFORE INSERT ON "FaithContentVersion"
FOR EACH ROW EXECUTE FUNCTION app.prepare_faith_content_version();

CREATE TRIGGER "FaithContentVersion_mark_draft_published"
AFTER INSERT ON "FaithContentVersion"
FOR EACH ROW EXECUTE FUNCTION app.mark_faith_content_draft_published();

CREATE TRIGGER "FaithContentVersion_guard_mutation"
BEFORE UPDATE OR DELETE ON "FaithContentVersion"
FOR EACH ROW EXECUTE FUNCTION app.guard_faith_content_version_mutation();

CREATE TRIGGER "FaithContentAudience_guard_mutation"
BEFORE INSERT OR UPDATE OR DELETE ON "FaithContentAudience"
FOR EACH ROW EXECUTE FUNCTION app.guard_faith_content_audience_mutation();

CREATE CONSTRAINT TRIGGER "FaithContentVersion_validate_audience"
AFTER INSERT ON "FaithContentVersion"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION app.validate_faith_content_audience();

CREATE CONSTRAINT TRIGGER "FaithContentAudience_validate_version"
AFTER INSERT OR UPDATE OR DELETE ON "FaithContentAudience"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION app.validate_faith_content_audience();

CREATE TRIGGER "FaithReadReceipt_reject_mutation"
BEFORE UPDATE OR DELETE ON "FaithReadReceipt"
FOR EACH ROW EXECUTE FUNCTION app.reject_faith_read_receipt_mutation();

CREATE TRIGGER "FaithReflection_guard_mutation"
BEFORE UPDATE OR DELETE ON "FaithReflection"
FOR EACH ROW EXECUTE FUNCTION app.guard_faith_reflection_mutation();

DO $$
DECLARE
  tbl TEXT;
  policy_name TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'FaithAgeBand',
    'FaithContent',
    'FaithContentDraft',
    'FaithContentVersion',
    'FaithContentAudience',
    'FaithReadReceipt',
    'FaithReflection'
  ]
  LOOP
    policy_name := tbl || '_tenant_rls';
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I
         USING (app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id())
         WITH CHECK (app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id());',
      policy_name,
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

CREATE FUNCTION app.reject_ace_term_report_target_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."childId" IS DISTINCT FROM OLD."childId"
    OR NEW."academicPeriodId" IS DISTINCT FROM OLD."academicPeriodId"
  THEN
    RAISE EXCEPTION 'ACE term report tenant and target are immutable'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION app.reject_ace_report_compilation_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'ACE report compilations are append-only'
    USING ERRCODE = 'object_not_in_prerequisite_state';
END;
$$;

CREATE FUNCTION app.guard_ace_report_draft_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" = 'APPROVED' THEN
      RAISE EXCEPTION 'Approved ACE report drafts are immutable'
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."reportId" IS DISTINCT FROM OLD."reportId"
    OR NEW."compilationId" IS DISTINCT FROM OLD."compilationId"
    OR NEW."authorUserId" IS DISTINCT FROM OLD."authorUserId"
  THEN
    RAISE EXCEPTION 'ACE report draft tenant, source, and author are immutable'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF OLD."status" = 'APPROVED' THEN
    RAISE EXCEPTION 'Approved ACE report drafts are immutable'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  -- Only the effective owner of the security-definer publication function may
  -- perform its nested approval update. Trigger nesting alone is not authority.
  IF NEW."status" = 'APPROVED' AND NOT (
    pg_trigger_depth() = 2
    AND CURRENT_USER = pg_catalog.pg_get_userbyid(
      (
        SELECT "proowner"
        FROM pg_catalog."pg_proc"
        WHERE "oid" = 'app.publish_approved_ace_report()'::pg_catalog.regprocedure
      )
    )
  ) THEN
    RAISE EXCEPTION 'ACE report drafts can be approved only by a review decision'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION app.reject_ace_report_review_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'ACE report reviews are append-only'
    USING ERRCODE = 'object_not_in_prerequisite_state';
END;
$$;

CREATE FUNCTION app.guard_ace_term_report_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT (
      pg_trigger_depth() = 2
      AND CURRENT_USER = pg_catalog.pg_get_userbyid(
        (
          SELECT "proowner"
          FROM pg_catalog."pg_proc"
          WHERE "oid" = 'app.publish_approved_ace_report()'::pg_catalog.regprocedure
        )
      )
    ) THEN
      RAISE EXCEPTION 'ACE report versions can be created only by approval'
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Published ACE report versions cannot be deleted'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF OLD."studentVisibleAt" IS NULL
    AND NEW."studentVisibleAt" IS NOT NULL
    AND NEW."id" IS NOT DISTINCT FROM OLD."id"
    AND NEW."tenantId" IS NOT DISTINCT FROM OLD."tenantId"
    AND NEW."reportId" IS NOT DISTINCT FROM OLD."reportId"
    AND NEW."sourceDraftId" IS NOT DISTINCT FROM OLD."sourceDraftId"
    AND NEW."versionNumber" IS NOT DISTINCT FROM OLD."versionNumber"
    AND NEW."familyPayload" IS NOT DISTINCT FROM OLD."familyPayload"
    AND NEW."privateDocumentKey" IS NOT DISTINCT FROM OLD."privateDocumentKey"
    AND NEW."guardianVisibleAt" IS NOT DISTINCT FROM OLD."guardianVisibleAt"
    AND NEW."supersedesVersionId" IS NOT DISTINCT FROM OLD."supersedesVersionId"
    AND NEW."createdAt" IS NOT DISTINCT FROM OLD."createdAt"
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Published ACE report data and release facts are immutable'
    USING ERRCODE = 'object_not_in_prerequisite_state';
END;
$$;

CREATE FUNCTION app.publish_approved_ace_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  draft_row RECORD;
  previous_version_id TEXT;
  next_version_number INTEGER;
  version_id TEXT := gen_random_uuid()::text;
BEGIN
  IF NEW."decision" <> 'APPROVED' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO draft_row
  FROM app."AceReportDraft"
  WHERE "id" = NEW."draftId" AND "tenantId" = NEW."tenantId"
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACE report draft does not exist in this tenant'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NEW."reviewerUserId" = draft_row."authorUserId" THEN
    RAISE EXCEPTION 'ACE report authors cannot approve their own drafts'
      USING ERRCODE = 'check_violation';
  END IF;
  IF draft_row."status" <> 'IN_REVIEW' THEN
    RAISE EXCEPTION 'ACE report approval requires an IN_REVIEW draft'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM app."AceTermReport"
  WHERE "id" = draft_row."reportId" AND "tenantId" = draft_row."tenantId"
  FOR UPDATE;

  SELECT "id", "versionNumber"
  INTO previous_version_id, next_version_number
  FROM app."AceTermReportVersion"
  WHERE "reportId" = draft_row."reportId"
  ORDER BY "versionNumber" DESC
  LIMIT 1;

  next_version_number := COALESCE(next_version_number, 0) + 1;

  UPDATE app."AceReportDraft"
  SET
    "status" = 'APPROVED',
    "approvedAt" = CURRENT_TIMESTAMP,
    "updatedAt" = CURRENT_TIMESTAMP
  WHERE "id" = draft_row."id";

  INSERT INTO app."AceTermReportVersion" (
    "id", "tenantId", "reportId", "sourceDraftId", "versionNumber",
    "familyPayload", "privateDocumentKey", "guardianVisibleAt",
    "supersedesVersionId"
  ) VALUES (
    version_id,
    draft_row."tenantId",
    draft_row."reportId",
    draft_row."id",
    next_version_number,
    draft_row."familyPayload",
    'tenants/' || draft_row."tenantId" || '/reports/' || version_id || '.pdf',
    CURRENT_TIMESTAMP,
    previous_version_id
  );

  RETURN NEW;
END;
$$;

-- Publication uses a database execution identity that no application login
-- can assume. Keep the function migration-owned until its public execution
-- paths are revoked and its one legitimate trigger is installed.
DO $$
DECLARE
  publisher_role_oid OID;
BEGIN
  SELECT "oid" INTO publisher_role_oid
  FROM pg_catalog."pg_roles"
  WHERE "rolname" = 'pathway_ace_report_publisher';

  IF publisher_role_oid IS NULL THEN
    CREATE ROLE pathway_ace_report_publisher
      NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT
      NOCREATEDB NOCREATEROLE NOREPLICATION;
  ELSIF EXISTS (
    SELECT 1
    FROM pg_catalog."pg_roles"
    WHERE "oid" = publisher_role_oid
      AND (
        "rolcanlogin" OR "rolsuper" OR "rolbypassrls" OR "rolinherit"
        OR "rolcreatedb" OR "rolcreaterole" OR "rolreplication"
      )
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog."pg_auth_members"
    WHERE "member" = publisher_role_oid OR "roleid" = publisher_role_oid
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog."pg_proc"
    WHERE "proowner" = publisher_role_oid
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog."pg_class"
    WHERE "relowner" = publisher_role_oid
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog."pg_namespace"
    WHERE "nspowner" = publisher_role_oid
  ) THEN
    RAISE EXCEPTION 'Existing ACE report publisher role is not an isolated capability role'
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;
END;
$$;

REVOKE ALL PRIVILEGES ON SCHEMA app FROM pathway_ace_report_publisher;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA app
  FROM pathway_ace_report_publisher;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA app
  FROM pathway_ace_report_publisher;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA app
  FROM pathway_ace_report_publisher;

GRANT USAGE ON SCHEMA app TO pathway_ace_report_publisher;
DO $$
DECLARE
  data_schema TEXT := pg_catalog.current_schema();
BEGIN
  EXECUTE pg_catalog.format(
    'GRANT SELECT ON TABLE %I."AceTermReport", %I."AceReportDraft", %I."AceTermReportVersion" TO pathway_ace_report_publisher;',
    data_schema, data_schema, data_schema
  );
  -- PostgreSQL requires UPDATE privilege for both FOR UPDATE locks.
  EXECUTE pg_catalog.format(
    'GRANT UPDATE ON TABLE %I."AceTermReport", %I."AceReportDraft" TO pathway_ace_report_publisher;',
    data_schema, data_schema
  );
  EXECUTE pg_catalog.format(
    'GRANT INSERT ON TABLE %I."AceTermReportVersion" TO pathway_ace_report_publisher;',
    data_schema
  );
END;
$$;

REVOKE ALL ON FUNCTION app.reject_ace_term_report_target_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.require_ace_report_actor_membership() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.reject_ace_report_compilation_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.guard_ace_report_draft_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.reject_ace_report_review_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.guard_ace_term_report_version_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.publish_approved_ace_report() FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION app.publish_approved_ace_report() FROM anon;
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION app.publish_approved_ace_report() FROM authenticated;
  END IF;
END;
$$;

CREATE TRIGGER "AceTermReport_reject_target_mutation"
BEFORE UPDATE OF "tenantId", "childId", "academicPeriodId"
ON "AceTermReport"
FOR EACH ROW EXECUTE FUNCTION app.reject_ace_term_report_target_mutation();

CREATE TRIGGER "AceReportCompilation_require_actor_membership"
BEFORE INSERT OR UPDATE OF "tenantId", "compiledByUserId"
ON "AceReportCompilation"
FOR EACH ROW EXECUTE FUNCTION app.require_ace_report_actor_membership('compiledByUserId');

CREATE TRIGGER "AceReportDraft_require_actor_membership"
BEFORE INSERT OR UPDATE OF "tenantId", "authorUserId"
ON "AceReportDraft"
FOR EACH ROW EXECUTE FUNCTION app.require_ace_report_actor_membership('authorUserId');

CREATE TRIGGER "AceReportReview_require_actor_membership"
BEFORE INSERT OR UPDATE OF "tenantId", "reviewerUserId"
ON "AceReportReview"
FOR EACH ROW EXECUTE FUNCTION app.require_ace_report_actor_membership('reviewerUserId');

CREATE TRIGGER "AceReportCompilation_reject_update_delete"
BEFORE UPDATE OR DELETE ON "AceReportCompilation"
FOR EACH ROW EXECUTE FUNCTION app.reject_ace_report_compilation_mutation();

CREATE TRIGGER "AceReportDraft_guard_mutation"
BEFORE UPDATE OR DELETE ON "AceReportDraft"
FOR EACH ROW EXECUTE FUNCTION app.guard_ace_report_draft_mutation();

CREATE TRIGGER "AceReportReview_reject_update_delete"
BEFORE UPDATE OR DELETE ON "AceReportReview"
FOR EACH ROW EXECUTE FUNCTION app.reject_ace_report_review_mutation();

CREATE TRIGGER "AceTermReportVersion_guard_mutation"
BEFORE INSERT OR UPDATE OR DELETE ON "AceTermReportVersion"
FOR EACH ROW EXECUTE FUNCTION app.guard_ace_term_report_version_mutation();

CREATE TRIGGER "AceReportReview_publish_approval"
AFTER INSERT ON "AceReportReview"
FOR EACH ROW EXECUTE FUNCTION app.publish_approved_ace_report();

-- ALTER FUNCTION OWNER requires the recipient to have CREATE on the function's
-- schema. Grant it only for the transfer, then leave the isolated owner with
-- schema USAGE and the minimal table privileges declared above.
GRANT pathway_ace_report_publisher TO CURRENT_USER;
GRANT CREATE ON SCHEMA app TO pathway_ace_report_publisher;
ALTER FUNCTION app.publish_approved_ace_report()
  OWNER TO pathway_ace_report_publisher;
REVOKE CREATE ON SCHEMA app FROM pathway_ace_report_publisher;
REVOKE pathway_ace_report_publisher FROM CURRENT_USER;

DO $$
DECLARE
  tbl TEXT;
  policy_name TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'AceTermReport',
    'AceReportCompilation',
    'AceReportDraft',
    'AceReportReview',
    'AceTermReportVersion'
  ]
  LOOP
    policy_name := tbl || '_tenant_rls';
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I
         USING (app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id())
         WITH CHECK (app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id());',
      policy_name,
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
