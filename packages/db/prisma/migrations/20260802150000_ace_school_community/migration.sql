-- ACE school Community is tenant-owned. It is intentionally separate from
-- NexSteps Home Community and contains no conversation or direct-message shape.

CREATE TYPE "AceCommunityGroupMembershipMode" AS ENUM ('MANUAL', 'AGE_RANGE');
CREATE TYPE "AceCommunityGroupStaffRole" AS ENUM ('MEMBER', 'MODERATOR');
CREATE TYPE "AceCommunityContentVisibility" AS ENUM ('VISIBLE', 'HIDDEN', 'REMOVED');
CREATE TYPE "AceCommunityReportReason" AS ENUM ('GUIDELINE_BREACH', 'BULLYING', 'SAFETY', 'OTHER');
CREATE TYPE "AceCommunityModerationActionType" AS ENUM ('HIDE', 'RESTORE', 'REMOVE');

CREATE TABLE "AceCommunityPolicy" (
  "tenantId" TEXT NOT NULL,
  "communityEnabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AceCommunityPolicy_pkey" PRIMARY KEY ("tenantId"),
  CONSTRAINT "AceCommunityPolicy_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "AceCommunityGroup" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "membershipMode" "AceCommunityGroupMembershipMode" NOT NULL,
  "minimumAge" INTEGER,
  "maximumAge" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AceCommunityGroup_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AceCommunityGroup_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "AceCommunityGroup_tenantId_name_key" UNIQUE ("tenantId", "name"),
  CONSTRAINT "AceCommunityGroup_name_check" CHECK (btrim("name") <> ''),
  CONSTRAINT "AceCommunityGroup_membership_mode_check" CHECK (
    ("membershipMode" = 'MANUAL' AND "minimumAge" IS NULL AND "maximumAge" IS NULL)
    OR (
      "membershipMode" = 'AGE_RANGE'
      AND "minimumAge" IS NOT NULL
      AND "maximumAge" IS NOT NULL
      AND "minimumAge" >= 0
      AND "maximumAge" >= "minimumAge"
    )
  ),
  CONSTRAINT "AceCommunityGroup_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceCommunityGroup_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "AceCommunityGroupChildMember" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AceCommunityGroupChildMember_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AceCommunityGroupChildMember_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "AceCommunityGroupChildMember_groupId_childId_key" UNIQUE ("groupId", "childId"),
  CONSTRAINT "AceCommunityGroupChildMember_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceCommunityGroupChildMember_groupId_tenantId_fkey"
    FOREIGN KEY ("groupId", "tenantId") REFERENCES "AceCommunityGroup"("id", "tenantId")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AceCommunityGroupChildMember_childId_tenantId_fkey"
    FOREIGN KEY ("childId", "tenantId") REFERENCES "Child"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "AceCommunityGroupStaffMember" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "staffUserId" TEXT NOT NULL,
  "role" "AceCommunityGroupStaffRole" NOT NULL DEFAULT 'MEMBER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AceCommunityGroupStaffMember_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AceCommunityGroupStaffMember_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "AceCommunityGroupStaffMember_groupId_staffUserId_key" UNIQUE ("groupId", "staffUserId"),
  CONSTRAINT "AceCommunityGroupStaffMember_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceCommunityGroupStaffMember_groupId_tenantId_fkey"
    FOREIGN KEY ("groupId", "tenantId") REFERENCES "AceCommunityGroup"("id", "tenantId")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AceCommunityGroupStaffMember_staffUserId_fkey"
    FOREIGN KEY ("staffUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "AceCommunityPost" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "authorUserId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "visibility" "AceCommunityContentVisibility" NOT NULL DEFAULT 'VISIBLE',
  "visibilityUpdatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AceCommunityPost_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AceCommunityPost_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "AceCommunityPost_id_tenantId_groupId_key" UNIQUE ("id", "tenantId", "groupId"),
  CONSTRAINT "AceCommunityPost_body_check" CHECK (btrim("body") <> ''),
  CONSTRAINT "AceCommunityPost_visibility_metadata_check" CHECK (
    ("visibility" = 'VISIBLE' AND "visibilityUpdatedAt" IS NULL)
    OR ("visibility" <> 'VISIBLE' AND "visibilityUpdatedAt" IS NOT NULL)
  ),
  CONSTRAINT "AceCommunityPost_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceCommunityPost_groupId_tenantId_fkey"
    FOREIGN KEY ("groupId", "tenantId") REFERENCES "AceCommunityGroup"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceCommunityPost_authorUserId_fkey"
    FOREIGN KEY ("authorUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "AceCommunityReply" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "authorUserId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "visibility" "AceCommunityContentVisibility" NOT NULL DEFAULT 'VISIBLE',
  "visibilityUpdatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AceCommunityReply_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AceCommunityReply_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "AceCommunityReply_id_tenantId_groupId_key" UNIQUE ("id", "tenantId", "groupId"),
  CONSTRAINT "AceCommunityReply_body_check" CHECK (btrim("body") <> ''),
  CONSTRAINT "AceCommunityReply_visibility_metadata_check" CHECK (
    ("visibility" = 'VISIBLE' AND "visibilityUpdatedAt" IS NULL)
    OR ("visibility" <> 'VISIBLE' AND "visibilityUpdatedAt" IS NOT NULL)
  ),
  CONSTRAINT "AceCommunityReply_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceCommunityReply_groupId_tenantId_fkey"
    FOREIGN KEY ("groupId", "tenantId") REFERENCES "AceCommunityGroup"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceCommunityReply_postId_tenantId_groupId_fkey"
    FOREIGN KEY ("postId", "tenantId", "groupId")
    REFERENCES "AceCommunityPost"("id", "tenantId", "groupId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceCommunityReply_authorUserId_fkey"
    FOREIGN KEY ("authorUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "AceCommunityReadCursor" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AceCommunityReadCursor_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AceCommunityReadCursor_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "AceCommunityReadCursor_tenantId_groupId_userId_key" UNIQUE ("tenantId", "groupId", "userId"),
  CONSTRAINT "AceCommunityReadCursor_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceCommunityReadCursor_groupId_tenantId_fkey"
    FOREIGN KEY ("groupId", "tenantId") REFERENCES "AceCommunityGroup"("id", "tenantId")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AceCommunityReadCursor_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "AceCommunityReport" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "postId" TEXT,
  "replyId" TEXT,
  "reportedByUserId" TEXT NOT NULL,
  "reason" "AceCommunityReportReason" NOT NULL,
  "evidenceSnapshot" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AceCommunityReport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AceCommunityReport_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "AceCommunityReport_id_tenantId_groupId_key" UNIQUE ("id", "tenantId", "groupId"),
  CONSTRAINT "AceCommunityReport_exactly_one_target_check" CHECK (
    (("postId" IS NOT NULL)::integer + ("replyId" IS NOT NULL)::integer) = 1
  ),
  CONSTRAINT "AceCommunityReport_evidence_snapshot_check" CHECK (btrim("evidenceSnapshot") <> ''),
  CONSTRAINT "AceCommunityReport_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceCommunityReport_groupId_tenantId_fkey"
    FOREIGN KEY ("groupId", "tenantId") REFERENCES "AceCommunityGroup"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceCommunityReport_postId_tenantId_groupId_fkey"
    FOREIGN KEY ("postId", "tenantId", "groupId")
    REFERENCES "AceCommunityPost"("id", "tenantId", "groupId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceCommunityReport_replyId_tenantId_groupId_fkey"
    FOREIGN KEY ("replyId", "tenantId", "groupId")
    REFERENCES "AceCommunityReply"("id", "tenantId", "groupId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceCommunityReport_reportedByUserId_fkey"
    FOREIGN KEY ("reportedByUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "AceCommunityModerationAction" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "moderatorUserId" TEXT NOT NULL,
  "actionType" "AceCommunityModerationActionType" NOT NULL,
  "reason" TEXT NOT NULL,
  "evidenceSnapshot" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AceCommunityModerationAction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AceCommunityModerationAction_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "AceCommunityModerationAction_reason_check" CHECK (btrim("reason") <> ''),
  CONSTRAINT "AceCommunityModerationAction_evidence_snapshot_check" CHECK (btrim("evidenceSnapshot") <> ''),
  CONSTRAINT "AceCommunityModerationAction_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceCommunityModerationAction_groupId_tenantId_fkey"
    FOREIGN KEY ("groupId", "tenantId") REFERENCES "AceCommunityGroup"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceCommunityModerationAction_reportId_tenantId_groupId_fkey"
    FOREIGN KEY ("reportId", "tenantId", "groupId")
    REFERENCES "AceCommunityReport"("id", "tenantId", "groupId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceCommunityModerationAction_moderatorUserId_fkey"
    FOREIGN KEY ("moderatorUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "AceCommunitySafeguardingReference" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "reportId" TEXT,
  "moderationActionId" TEXT,
  "concernId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AceCommunitySafeguardingReference_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AceCommunitySafeguardingReference_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "AceCommunitySafeguardingReference_exactly_one_source_check" CHECK (
    (("reportId" IS NOT NULL)::integer + ("moderationActionId" IS NOT NULL)::integer) = 1
  ),
  CONSTRAINT "AceCommunitySafeguardingReference_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceCommunitySafeguardingReference_reportId_tenantId_fkey"
    FOREIGN KEY ("reportId", "tenantId") REFERENCES "AceCommunityReport"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceCommunitySafeguardingReference_moderationActionId_tenantId_fkey"
    FOREIGN KEY ("moderationActionId", "tenantId") REFERENCES "AceCommunityModerationAction"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceCommunitySafeguardingReference_concernId_fkey"
    FOREIGN KEY ("concernId") REFERENCES "Concern"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "AceCommunityGroup_tenantId_isActive_idx"
  ON "AceCommunityGroup"("tenantId", "isActive");
CREATE INDEX "AceCommunityGroup_tenantId_membershipMode_idx"
  ON "AceCommunityGroup"("tenantId", "membershipMode");
CREATE INDEX "AceCommunityGroupChildMember_tenantId_childId_idx"
  ON "AceCommunityGroupChildMember"("tenantId", "childId");
CREATE INDEX "AceCommunityGroupStaffMember_tenantId_staffUserId_idx"
  ON "AceCommunityGroupStaffMember"("tenantId", "staffUserId");
CREATE INDEX "AceCommunityPost_tenantId_groupId_createdAt_idx"
  ON "AceCommunityPost"("tenantId", "groupId", "createdAt");
CREATE INDEX "AceCommunityPost_tenantId_authorUserId_createdAt_idx"
  ON "AceCommunityPost"("tenantId", "authorUserId", "createdAt");
CREATE INDEX "AceCommunityReply_tenantId_groupId_postId_createdAt_idx"
  ON "AceCommunityReply"("tenantId", "groupId", "postId", "createdAt");
CREATE INDEX "AceCommunityReply_tenantId_authorUserId_createdAt_idx"
  ON "AceCommunityReply"("tenantId", "authorUserId", "createdAt");
CREATE INDEX "AceCommunityReadCursor_tenantId_userId_lastReadAt_idx"
  ON "AceCommunityReadCursor"("tenantId", "userId", "lastReadAt");
CREATE INDEX "AceCommunityReport_tenantId_postId_idx"
  ON "AceCommunityReport"("tenantId", "postId");
CREATE INDEX "AceCommunityReport_tenantId_replyId_idx"
  ON "AceCommunityReport"("tenantId", "replyId");
CREATE INDEX "AceCommunityReport_tenantId_groupId_createdAt_idx"
  ON "AceCommunityReport"("tenantId", "groupId", "createdAt");
CREATE INDEX "AceCommunityModerationAction_tenantId_reportId_createdAt_idx"
  ON "AceCommunityModerationAction"("tenantId", "reportId", "createdAt");
CREATE INDEX "AceCommunityModerationAction_tenantId_groupId_createdAt_idx"
  ON "AceCommunityModerationAction"("tenantId", "groupId", "createdAt");
CREATE INDEX "AceCommunitySafeguardingReference_tenantId_reportId_idx"
  ON "AceCommunitySafeguardingReference"("tenantId", "reportId");
CREATE INDEX "AceCommunitySafeguardingReference_tenantId_moderationActionId_idx"
  ON "AceCommunitySafeguardingReference"("tenantId", "moderationActionId");
CREATE INDEX "AceCommunitySafeguardingReference_concernId_idx"
  ON "AceCommunitySafeguardingReference"("concernId");

-- A MANUAL group is the only group allowed to persist named child members.
CREATE FUNCTION app.assert_ace_community_child_member_mode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM app."AceCommunityGroup" group_record
    WHERE group_record."id" = NEW."groupId"
      AND group_record."tenantId" = NEW."tenantId"
      AND group_record."membershipMode" = 'MANUAL'
  ) THEN
    RAISE EXCEPTION 'Only manual Community groups may have explicit child members'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- A group cannot be converted to automatic age-range membership while it
-- retains the named children that are valid only for a MANUAL group.
CREATE FUNCTION app.assert_ace_community_group_membership_mode_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW."membershipMode" = 'AGE_RANGE' AND EXISTS (
    SELECT 1
    FROM app."AceCommunityGroupChildMember"
    WHERE "tenantId" = NEW."tenantId" AND "groupId" = NEW."id"
  ) THEN
    RAISE EXCEPTION 'Age-range Community groups cannot retain explicit child members'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Staff participate only when they remain current site members.
CREATE FUNCTION app.assert_ace_community_staff_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM app."SiteMembership"
    WHERE "tenantId" = NEW."tenantId" AND "userId" = NEW."staffUserId"
  ) THEN
    RAISE EXCEPTION 'Community staff members require a current site membership'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Content authors are either explicit staff participants or active student
-- identities linked to a child currently eligible for this exact group.
CREATE FUNCTION app.assert_ace_community_author()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  is_authorised boolean := false;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM app."AceCommunityPolicy"
    WHERE "tenantId" = NEW."tenantId" AND "communityEnabled"
  ) THEN
    RAISE EXCEPTION 'Community is disabled for this tenant'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM app."AceCommunityGroup"
    WHERE "id" = NEW."groupId"
      AND "tenantId" = NEW."tenantId"
      AND "isActive"
  ) THEN
    RAISE EXCEPTION 'Community group is not active'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM app."AceCommunityGroupStaffMember" group_staff
    JOIN app."SiteMembership" site_membership
      ON site_membership."tenantId" = group_staff."tenantId"
      AND site_membership."userId" = group_staff."staffUserId"
    WHERE group_staff."tenantId" = NEW."tenantId"
      AND group_staff."groupId" = NEW."groupId"
      AND group_staff."staffUserId" = NEW."authorUserId"
  ) INTO is_authorised;

  IF is_authorised THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM app."StudentIdentity" identity_record
    JOIN app."StudentIdentityLink" identity_link
      ON identity_link."studentIdentityId" = identity_record."id"
      AND identity_link."tenantId" = identity_record."tenantId"
    JOIN app."Child" child_record
      ON child_record."id" = identity_link."childId"
      AND child_record."tenantId" = identity_link."tenantId"
    JOIN app."AceCommunityGroup" group_record
      ON group_record."id" = NEW."groupId"
      AND group_record."tenantId" = NEW."tenantId"
    JOIN app."Tenant" tenant_record
      ON tenant_record."id" = NEW."tenantId"
    WHERE identity_record."tenantId" = NEW."tenantId"
      AND identity_record."userId" = NEW."authorUserId"
      AND identity_link."linkedAt" <= CURRENT_TIMESTAMP
      AND identity_link."endedAt" IS NULL
      AND identity_link."revokedAt" IS NULL
      AND child_record."dateOfBirth" IS NOT NULL
      AND (
        (
          group_record."membershipMode" = 'MANUAL'
          AND EXISTS (
            SELECT 1
            FROM app."AceCommunityGroupChildMember" child_member
            WHERE child_member."tenantId" = NEW."tenantId"
              AND child_member."groupId" = NEW."groupId"
              AND child_member."childId" = child_record."id"
          )
        )
        OR (
          group_record."membershipMode" = 'AGE_RANGE'
          AND EXTRACT(
            YEAR FROM age(
              (CURRENT_TIMESTAMP AT TIME ZONE COALESCE(tenant_record."timezone", 'UTC'))::date,
              child_record."dateOfBirth"::date
            )
          ) BETWEEN group_record."minimumAge" AND group_record."maximumAge"
        )
      )
  ) INTO is_authorised;

  IF NOT is_authorised THEN
    RAISE EXCEPTION 'Community author is not eligible for this group'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Safeguarding references remain identifiers only and cannot cross the school
-- boundary through the existing Concern -> Child relationship.
CREATE FUNCTION app.assert_ace_community_safeguarding_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM app."Concern" concern_record
    JOIN app."Child" child_record ON child_record."id" = concern_record."childId"
    WHERE concern_record."id" = NEW."concernId"
      AND child_record."tenantId" = NEW."tenantId"
  ) THEN
    RAISE EXCEPTION 'Community safeguarding references must remain in the same tenant'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION app.reject_ace_community_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Community moderation evidence is immutable'
    USING ERRCODE = 'object_not_in_prerequisite_state';
END;
$$;

CREATE FUNCTION app.reject_ace_community_content_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Community content must be moderated through visibility'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."groupId" IS DISTINCT FROM OLD."groupId"
    OR NEW."authorUserId" IS DISTINCT FROM OLD."authorUserId"
    OR NEW."body" IS DISTINCT FROM OLD."body"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'Community content scope and body are immutable'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF NEW."visibility" = OLD."visibility"
    AND NEW."visibilityUpdatedAt" IS DISTINCT FROM OLD."visibilityUpdatedAt"
  THEN
    RAISE EXCEPTION 'Community visibility metadata requires a visibility change'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.assert_ace_community_child_member_mode() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.assert_ace_community_group_membership_mode_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.assert_ace_community_staff_member() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.assert_ace_community_author() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.assert_ace_community_safeguarding_reference() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.reject_ace_community_evidence_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.reject_ace_community_content_mutation() FROM PUBLIC;

CREATE TRIGGER "AceCommunityGroupChildMember_manual_group_only"
BEFORE INSERT OR UPDATE OF "tenantId", "groupId", "childId" ON "AceCommunityGroupChildMember"
FOR EACH ROW EXECUTE FUNCTION app.assert_ace_community_child_member_mode();

CREATE TRIGGER "AceCommunityGroup_age_range_has_no_child_projection"
BEFORE UPDATE OF "membershipMode", "tenantId" ON "AceCommunityGroup"
FOR EACH ROW EXECUTE FUNCTION app.assert_ace_community_group_membership_mode_mutation();

CREATE TRIGGER "AceCommunityGroupStaffMember_require_site_membership"
BEFORE INSERT OR UPDATE OF "tenantId", "staffUserId" ON "AceCommunityGroupStaffMember"
FOR EACH ROW EXECUTE FUNCTION app.assert_ace_community_staff_member();

CREATE TRIGGER "AceCommunityPost_require_eligible_author"
BEFORE INSERT ON "AceCommunityPost"
FOR EACH ROW EXECUTE FUNCTION app.assert_ace_community_author();

CREATE TRIGGER "AceCommunityReply_require_eligible_author"
BEFORE INSERT ON "AceCommunityReply"
FOR EACH ROW EXECUTE FUNCTION app.assert_ace_community_author();

CREATE TRIGGER "AceCommunitySafeguardingReference_require_same_tenant_concern"
BEFORE INSERT OR UPDATE OF "tenantId", "concernId" ON "AceCommunitySafeguardingReference"
FOR EACH ROW EXECUTE FUNCTION app.assert_ace_community_safeguarding_reference();

CREATE TRIGGER "AceCommunityReport_immutable"
BEFORE UPDATE OR DELETE ON "AceCommunityReport"
FOR EACH ROW EXECUTE FUNCTION app.reject_ace_community_evidence_mutation();

CREATE TRIGGER "AceCommunityModerationAction_immutable"
BEFORE UPDATE OR DELETE ON "AceCommunityModerationAction"
FOR EACH ROW EXECUTE FUNCTION app.reject_ace_community_evidence_mutation();

CREATE TRIGGER "AceCommunitySafeguardingReference_immutable"
BEFORE UPDATE OR DELETE ON "AceCommunitySafeguardingReference"
FOR EACH ROW EXECUTE FUNCTION app.reject_ace_community_evidence_mutation();

CREATE TRIGGER "AceCommunityPost_content_immutable"
BEFORE UPDATE OR DELETE ON "AceCommunityPost"
FOR EACH ROW EXECUTE FUNCTION app.reject_ace_community_content_mutation();

CREATE TRIGGER "AceCommunityReply_content_immutable"
BEFORE UPDATE OR DELETE ON "AceCommunityReply"
FOR EACH ROW EXECUTE FUNCTION app.reject_ace_community_content_mutation();

-- Every Community table carries tenantId, forces tenant RLS, and has no
-- NexSteps platform or Data API exception.
DO $$
DECLARE
  tbl text;
  policy_name text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'AceCommunityPolicy',
    'AceCommunityGroup',
    'AceCommunityGroupChildMember',
    'AceCommunityGroupStaffMember',
    'AceCommunityPost',
    'AceCommunityReply',
    'AceCommunityReadCursor',
    'AceCommunityReport',
    'AceCommunityModerationAction',
    'AceCommunitySafeguardingReference'
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
