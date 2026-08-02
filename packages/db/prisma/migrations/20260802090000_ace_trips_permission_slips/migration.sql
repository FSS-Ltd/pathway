-- ACE trips and permission slips. Trip checkpoints record child-only attendance
-- at staff-configurable moments during the day. Permission-slip versions keep
-- consent wording, recipient scope, and offline exceptions auditable.

CREATE TYPE "PermissionSlipChangeClassification" AS ENUM ('INITIAL', 'MATERIAL', 'NON_MATERIAL');
CREATE TYPE "PermissionSlipResponseDecision" AS ENUM ('ACCEPTED', 'DECLINED');
CREATE TYPE "PermissionSlipExceptionSource" AS ENUM ('PHYSICAL', 'TELEPHONE');

CREATE TABLE "Trip" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "destination" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "cancelledAt" TIMESTAMP(3),
  "cancelledByUserId" TEXT,
  "cancellationReason" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Trip_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Trip_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "Trip_time_window_check" CHECK (
    pg_catalog.isfinite("startsAt")
    AND pg_catalog.isfinite("endsAt")
    AND "endsAt" > "startsAt"
  ),
  CONSTRAINT "Trip_cancellation_metadata_check" CHECK (
    ("cancelledAt" IS NULL AND "cancelledByUserId" IS NULL AND "cancellationReason" IS NULL)
    OR (
      "cancelledAt" IS NOT NULL
      AND "cancelledByUserId" IS NOT NULL
      AND "cancellationReason" IS NOT NULL
      AND btrim("cancellationReason") <> ''
    )
  ),
  CONSTRAINT "Trip_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Trip_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Trip_cancelledByUserId_fkey"
    FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "TripCheckpoint" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "tripId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "plannedAt" TIMESTAMP(3),
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TripCheckpoint_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TripCheckpoint_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "TripCheckpoint_tenantId_tripId_position_key" UNIQUE ("tenantId", "tripId", "position"),
  CONSTRAINT "TripCheckpoint_label_check" CHECK (btrim("label") <> ''),
  CONSTRAINT "TripCheckpoint_position_check" CHECK ("position" > 0),
  CONSTRAINT "TripCheckpoint_plannedAt_check" CHECK (
    "plannedAt" IS NULL OR pg_catalog.isfinite("plannedAt")
  ),
  CONSTRAINT "TripCheckpoint_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TripCheckpoint_tripId_tenantId_fkey"
    FOREIGN KEY ("tripId", "tenantId") REFERENCES "Trip"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TripCheckpoint_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "TripCheckpointAttendance" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "tripCheckpointId" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "present" BOOLEAN NOT NULL,
  "markedByUserId" TEXT NOT NULL,
  "markedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TripCheckpointAttendance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TripCheckpointAttendance_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "TripCheckpointAttendance_tenantId_tripCheckpointId_childId_key"
    UNIQUE ("tenantId", "tripCheckpointId", "childId"),
  CONSTRAINT "TripCheckpointAttendance_markedAt_check" CHECK (pg_catalog.isfinite("markedAt")),
  CONSTRAINT "TripCheckpointAttendance_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TripCheckpointAttendance_tripCheckpointId_tenantId_fkey"
    FOREIGN KEY ("tripCheckpointId", "tenantId") REFERENCES "TripCheckpoint"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TripCheckpointAttendance_childId_tenantId_fkey"
    FOREIGN KEY ("childId", "tenantId") REFERENCES "Child"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TripCheckpointAttendance_markedByUserId_fkey"
    FOREIGN KEY ("markedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "PermissionSlip" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "tripId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PermissionSlip_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PermissionSlip_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "PermissionSlip_tripId_tenantId_key" UNIQUE ("tripId", "tenantId"),
  CONSTRAINT "PermissionSlip_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PermissionSlip_tripId_tenantId_fkey"
    FOREIGN KEY ("tripId", "tenantId") REFERENCES "Trip"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PermissionSlip_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "PermissionSlipVersion" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "permissionSlipId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "contentSnapshot" JSONB NOT NULL,
  "versionHash" TEXT,
  "changeClassification" "PermissionSlipChangeClassification" NOT NULL DEFAULT 'INITIAL',
  "requiresReconsent" BOOLEAN NOT NULL DEFAULT false,
  "publishedAt" TIMESTAMP(3),
  "publishedByUserId" TEXT,
  "supersedesVersionId" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PermissionSlipVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PermissionSlipVersion_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "PermissionSlipVersion_id_tenantId_permissionSlipId_key"
    UNIQUE ("id", "tenantId", "permissionSlipId"),
  CONSTRAINT "PermissionSlipVersion_id_tenantId_versionHash_key"
    UNIQUE ("id", "tenantId", "versionHash"),
  CONSTRAINT "PermissionSlipVersion_tenantId_permissionSlipId_version_key"
    UNIQUE ("tenantId", "permissionSlipId", "version"),
  CONSTRAINT "PermissionSlipVersion_version_check" CHECK ("version" > 0),
  CONSTRAINT "PermissionSlipVersion_hash_check" CHECK (
    "versionHash" IS NULL OR "versionHash" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "PermissionSlipVersion_publish_metadata_check" CHECK (
    ("publishedAt" IS NULL AND "publishedByUserId" IS NULL AND "versionHash" IS NULL)
    OR (
      "publishedAt" IS NOT NULL
      AND "publishedByUserId" IS NOT NULL
      AND "versionHash" IS NOT NULL
    )
  ),
  CONSTRAINT "PermissionSlipVersion_material_reconsent_check"
    CHECK (("changeClassification" = 'MATERIAL') = "requiresReconsent"),
  CONSTRAINT "PermissionSlipVersion_supersession_check" CHECK (
    ("changeClassification" = 'INITIAL' AND "supersedesVersionId" IS NULL)
    OR (
      "changeClassification" <> 'INITIAL'
      AND "supersedesVersionId" IS NOT NULL
      AND "supersedesVersionId" <> "id"
    )
  ),
  CONSTRAINT "PermissionSlipVersion_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PermissionSlipVersion_permissionSlipId_tenantId_fkey"
    FOREIGN KEY ("permissionSlipId", "tenantId") REFERENCES "PermissionSlip"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PermissionSlipVersion_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PermissionSlipVersion_publishedByUserId_fkey"
    FOREIGN KEY ("publishedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PermissionSlipVersion_supersedesVersionId_tenantId_permissionSlipId_fkey"
    FOREIGN KEY ("supersedesVersionId", "tenantId", "permissionSlipId")
    REFERENCES "PermissionSlipVersion"("id", "tenantId", "permissionSlipId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "PermissionSlipRecipient" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "permissionSlipVersionId" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PermissionSlipRecipient_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PermissionSlipRecipient_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "PermissionSlipRecipient_id_tenantId_childId_permissionSlipVersionId_key"
    UNIQUE ("id", "tenantId", "childId", "permissionSlipVersionId"),
  CONSTRAINT "PermissionSlipRecipient_tenantId_permissionSlipVersionId_childId_key"
    UNIQUE ("tenantId", "permissionSlipVersionId", "childId"),
  CONSTRAINT "PermissionSlipRecipient_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PermissionSlipRecipient_permissionSlipVersionId_tenantId_fkey"
    FOREIGN KEY ("permissionSlipVersionId", "tenantId") REFERENCES "PermissionSlipVersion"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PermissionSlipRecipient_childId_tenantId_fkey"
    FOREIGN KEY ("childId", "tenantId") REFERENCES "Child"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- A child and guardian relationship are both part of the permission response
-- foreign key, so a guardian can never answer for a different child.
ALTER TABLE "GuardianChildRelationship"
  ADD CONSTRAINT "GuardianChildRelationship_id_tenantId_childId_guardianIdentityId_key"
  UNIQUE ("id", "tenantId", "childId", "guardianIdentityId");

CREATE TABLE "PermissionSlipResponse" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "permissionSlipVersionId" TEXT NOT NULL,
  "permissionSlipRecipientId" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "guardianChildRelationshipId" TEXT NOT NULL,
  "guardianIdentityId" TEXT NOT NULL,
  "versionHash" TEXT NOT NULL,
  "decision" "PermissionSlipResponseDecision" NOT NULL,
  "responsePayload" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "respondedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PermissionSlipResponse_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PermissionSlipResponse_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "PermissionSlipResponse_tenantId_permissionSlipVersionId_guardianChildRelationshipId_idempotencyKey_key"
    UNIQUE ("tenantId", "permissionSlipVersionId", "guardianChildRelationshipId", "idempotencyKey"),
  CONSTRAINT "PermissionSlipResponse_payload_check" CHECK (btrim("responsePayload") <> ''),
  CONSTRAINT "PermissionSlipResponse_idempotencyKey_check" CHECK (btrim("idempotencyKey") <> ''),
  CONSTRAINT "PermissionSlipResponse_respondedAt_check" CHECK (pg_catalog.isfinite("respondedAt")),
  CONSTRAINT "PermissionSlipResponse_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PermissionSlipResponse_version_fkey"
    FOREIGN KEY ("permissionSlipVersionId", "tenantId", "versionHash")
    REFERENCES "PermissionSlipVersion"("id", "tenantId", "versionHash") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PermissionSlipResponse_recipient_fkey"
    FOREIGN KEY ("permissionSlipRecipientId", "tenantId", "childId", "permissionSlipVersionId")
    REFERENCES "PermissionSlipRecipient"("id", "tenantId", "childId", "permissionSlipVersionId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PermissionSlipResponse_child_fkey"
    FOREIGN KEY ("childId", "tenantId") REFERENCES "Child"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PermissionSlipResponse_guardian_relationship_fkey"
    FOREIGN KEY ("guardianChildRelationshipId", "tenantId", "childId", "guardianIdentityId")
    REFERENCES "GuardianChildRelationship"("id", "tenantId", "childId", "guardianIdentityId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "PermissionSlipException" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "permissionSlipVersionId" TEXT NOT NULL,
  "permissionSlipRecipientId" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "versionHash" TEXT NOT NULL,
  "source" "PermissionSlipExceptionSource" NOT NULL,
  "decision" "PermissionSlipResponseDecision" NOT NULL,
  "recordedByUserId" TEXT NOT NULL,
  "witnessUserId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PermissionSlipException_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PermissionSlipException_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "PermissionSlipException_reason_check" CHECK (btrim("reason") <> ''),
  CONSTRAINT "PermissionSlipException_witness_check" CHECK ("recordedByUserId" <> "witnessUserId"),
  CONSTRAINT "PermissionSlipException_recordedAt_check" CHECK (pg_catalog.isfinite("recordedAt")),
  CONSTRAINT "PermissionSlipException_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PermissionSlipException_version_fkey"
    FOREIGN KEY ("permissionSlipVersionId", "tenantId", "versionHash")
    REFERENCES "PermissionSlipVersion"("id", "tenantId", "versionHash") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PermissionSlipException_recipient_fkey"
    FOREIGN KEY ("permissionSlipRecipientId", "tenantId", "childId", "permissionSlipVersionId")
    REFERENCES "PermissionSlipRecipient"("id", "tenantId", "childId", "permissionSlipVersionId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PermissionSlipException_child_fkey"
    FOREIGN KEY ("childId", "tenantId") REFERENCES "Child"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PermissionSlipException_recordedByUserId_fkey"
    FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PermissionSlipException_witnessUserId_fkey"
    FOREIGN KEY ("witnessUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "PermissionSlipReminder" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "permissionSlipVersionId" TEXT NOT NULL,
  "permissionSlipRecipientId" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PermissionSlipReminder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PermissionSlipReminder_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "PermissionSlipReminder_scheduledFor_check" CHECK (pg_catalog.isfinite("scheduledFor")),
  CONSTRAINT "PermissionSlipReminder_terminal_state_check" CHECK (
    "sentAt" IS NULL OR "cancelledAt" IS NULL
  ),
  CONSTRAINT "PermissionSlipReminder_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PermissionSlipReminder_version_fkey"
    FOREIGN KEY ("permissionSlipVersionId", "tenantId") REFERENCES "PermissionSlipVersion"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PermissionSlipReminder_recipient_fkey"
    FOREIGN KEY ("permissionSlipRecipientId", "tenantId", "childId", "permissionSlipVersionId")
    REFERENCES "PermissionSlipRecipient"("id", "tenantId", "childId", "permissionSlipVersionId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PermissionSlipReminder_child_fkey"
    FOREIGN KEY ("childId", "tenantId") REFERENCES "Child"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "Trip_tenantId_startsAt_idx" ON "Trip"("tenantId", "startsAt");
CREATE INDEX "TripCheckpoint_tenantId_tripId_idx" ON "TripCheckpoint"("tenantId", "tripId");
CREATE INDEX "TripCheckpointAttendance_tenantId_childId_idx"
  ON "TripCheckpointAttendance"("tenantId", "childId");
CREATE INDEX "PermissionSlipVersion_tenantId_permissionSlipId_publishedAt_idx"
  ON "PermissionSlipVersion"("tenantId", "permissionSlipId", "publishedAt");
CREATE INDEX "PermissionSlipRecipient_tenantId_childId_idx"
  ON "PermissionSlipRecipient"("tenantId", "childId");
CREATE INDEX "PermissionSlipResponse_tenantId_permissionSlipRecipientId_idx"
  ON "PermissionSlipResponse"("tenantId", "permissionSlipRecipientId");
CREATE INDEX "PermissionSlipException_tenantId_permissionSlipRecipientId_idx"
  ON "PermissionSlipException"("tenantId", "permissionSlipRecipientId");
CREATE INDEX "PermissionSlipReminder_tenantId_scheduledFor_idx"
  ON "PermissionSlipReminder"("tenantId", "scheduledFor");

-- A record's actors must belong to its tenant even when a high-privilege
-- service connection is used. Guardian responses use their relationship key
-- instead, because guardians are not staff members.
CREATE FUNCTION app.require_trip_slip_actor_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_user_id text;
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
    RAISE EXCEPTION 'Trip and permission-slip actor must belong to the tenant'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.require_trip_slip_actor_membership() FROM PUBLIC;

CREATE TRIGGER "Trip_require_created_by_membership"
BEFORE INSERT OR UPDATE OF "tenantId", "createdByUserId" ON "Trip"
FOR EACH ROW EXECUTE FUNCTION app.require_trip_slip_actor_membership('createdByUserId');
CREATE TRIGGER "Trip_require_cancelled_by_membership"
BEFORE INSERT OR UPDATE OF "tenantId", "cancelledByUserId" ON "Trip"
FOR EACH ROW WHEN (NEW."cancelledByUserId" IS NOT NULL)
EXECUTE FUNCTION app.require_trip_slip_actor_membership('cancelledByUserId');
CREATE TRIGGER "TripCheckpoint_require_created_by_membership"
BEFORE INSERT OR UPDATE OF "tenantId", "createdByUserId" ON "TripCheckpoint"
FOR EACH ROW EXECUTE FUNCTION app.require_trip_slip_actor_membership('createdByUserId');
CREATE TRIGGER "TripCheckpointAttendance_require_marker_membership"
BEFORE INSERT OR UPDATE OF "tenantId", "markedByUserId" ON "TripCheckpointAttendance"
FOR EACH ROW EXECUTE FUNCTION app.require_trip_slip_actor_membership('markedByUserId');
CREATE TRIGGER "PermissionSlip_require_created_by_membership"
BEFORE INSERT OR UPDATE OF "tenantId", "createdByUserId" ON "PermissionSlip"
FOR EACH ROW EXECUTE FUNCTION app.require_trip_slip_actor_membership('createdByUserId');
CREATE TRIGGER "PermissionSlipVersion_require_created_by_membership"
BEFORE INSERT OR UPDATE OF "tenantId", "createdByUserId" ON "PermissionSlipVersion"
FOR EACH ROW EXECUTE FUNCTION app.require_trip_slip_actor_membership('createdByUserId');
CREATE TRIGGER "PermissionSlipVersion_require_publisher_membership"
BEFORE INSERT OR UPDATE OF "tenantId", "publishedByUserId" ON "PermissionSlipVersion"
FOR EACH ROW WHEN (NEW."publishedByUserId" IS NOT NULL)
EXECUTE FUNCTION app.require_trip_slip_actor_membership('publishedByUserId');
CREATE TRIGGER "PermissionSlipException_require_recorder_membership"
BEFORE INSERT OR UPDATE OF "tenantId", "recordedByUserId" ON "PermissionSlipException"
FOR EACH ROW EXECUTE FUNCTION app.require_trip_slip_actor_membership('recordedByUserId');
CREATE TRIGGER "PermissionSlipException_require_witness_membership"
BEFORE INSERT OR UPDATE OF "tenantId", "witnessUserId" ON "PermissionSlipException"
FOR EACH ROW EXECUTE FUNCTION app.require_trip_slip_actor_membership('witnessUserId');

-- Published wording and fact records cannot be rewritten. Unpublished drafts
-- and reminder delivery state remain mutable where that is operationally needed.
CREATE FUNCTION app.reject_published_permission_slip_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD."publishedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Published permission-slip versions are immutable'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE FUNCTION app.reject_published_permission_slip_recipient_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP <> 'INSERT' AND EXISTS (
    SELECT 1
    FROM app."PermissionSlipVersion"
    WHERE "id" = OLD."permissionSlipVersionId"
      AND "tenantId" = OLD."tenantId"
      AND "publishedAt" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Recipients on a published permission slip are immutable'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF TG_OP <> 'DELETE' AND EXISTS (
    SELECT 1
    FROM app."PermissionSlipVersion"
    WHERE "id" = NEW."permissionSlipVersionId"
      AND "tenantId" = NEW."tenantId"
      AND "publishedAt" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Recipients on a published permission slip are immutable'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE FUNCTION app.reject_published_permission_slip_scope_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
      OR NEW."tripId" IS DISTINCT FROM OLD."tripId")
    AND EXISTS (
      SELECT 1
      FROM app."PermissionSlipVersion"
      WHERE "permissionSlipId" = OLD."id"
        AND "tenantId" = OLD."tenantId"
        AND "publishedAt" IS NOT NULL
    )
  THEN
    RAISE EXCEPTION 'A published permission slip cannot be retargeted to another trip'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION app.reject_permission_slip_fact_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Permission-slip responses and exceptions are immutable facts'
    USING ERRCODE = 'object_not_in_prerequisite_state';
END;
$$;

REVOKE ALL ON FUNCTION app.reject_published_permission_slip_version_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.reject_published_permission_slip_recipient_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.reject_published_permission_slip_scope_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.reject_permission_slip_fact_mutation() FROM PUBLIC;

CREATE TRIGGER "PermissionSlipVersion_published_immutable"
BEFORE UPDATE OR DELETE ON "PermissionSlipVersion"
FOR EACH ROW EXECUTE FUNCTION app.reject_published_permission_slip_version_mutation();
CREATE TRIGGER "PermissionSlipRecipient_published_immutable"
BEFORE INSERT OR UPDATE OR DELETE ON "PermissionSlipRecipient"
FOR EACH ROW EXECUTE FUNCTION app.reject_published_permission_slip_recipient_mutation();
CREATE TRIGGER "PermissionSlip_published_scope_immutable"
BEFORE UPDATE OF "tenantId", "tripId" ON "PermissionSlip"
FOR EACH ROW EXECUTE FUNCTION app.reject_published_permission_slip_scope_mutation();
CREATE TRIGGER "PermissionSlipResponse_immutable"
BEFORE UPDATE OR DELETE ON "PermissionSlipResponse"
FOR EACH ROW EXECUTE FUNCTION app.reject_permission_slip_fact_mutation();
CREATE TRIGGER "PermissionSlipException_immutable"
BEFORE UPDATE OR DELETE ON "PermissionSlipException"
FOR EACH ROW EXECUTE FUNCTION app.reject_permission_slip_fact_mutation();

-- Every table carries tenantId directly and has forced tenant RLS. No Data API
-- role receives a direct table grant.
DO $$
DECLARE
  tbl text;
  policy_name text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'Trip',
    'TripCheckpoint',
    'TripCheckpointAttendance',
    'PermissionSlip',
    'PermissionSlipVersion',
    'PermissionSlipRecipient',
    'PermissionSlipResponse',
    'PermissionSlipException',
    'PermissionSlipReminder'
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
