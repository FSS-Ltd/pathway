BEGIN;

CREATE TABLE "AceSchoolVolunteerReservation" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "guardianIdentityId" TEXT NOT NULL,
  "academicPeriodId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "slot" INTEGER NOT NULL,
  "cancelledAt" TIMESTAMP(3),
  "cancelledByUserId" TEXT,
  "cancellationReason" VARCHAR(240),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AceSchoolVolunteerReservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AceSchoolVolunteerReservation_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "AceSchoolVolunteerReservation_slot_check" CHECK ("slot" IN (1, 2)),
  CONSTRAINT "AceSchoolVolunteerReservation_cancellation_check" CHECK (
    ("cancelledAt" IS NULL AND "cancelledByUserId" IS NULL AND "cancellationReason" IS NULL)
    OR ("cancelledAt" IS NOT NULL AND "cancelledByUserId" IS NOT NULL
        AND "cancellationReason" IS NOT NULL
        AND length(btrim("cancellationReason")) BETWEEN 1 AND 240)
  ),
  CONSTRAINT "AceSchoolVolunteerReservation_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceSchoolVolunteerReservation_guardianIdentityId_tenantId_fkey"
    FOREIGN KEY ("guardianIdentityId", "tenantId")
    REFERENCES "GuardianIdentity"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceSchoolVolunteerReservation_academicPeriodId_tenantId_fkey"
    FOREIGN KEY ("academicPeriodId", "tenantId")
    REFERENCES "AcademicPeriod"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceSchoolVolunteerReservation_cancelledByUserId_fkey"
    FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "AceSchoolVolunteerReservation_tenantId_academicPeriodId_dat_idx"
  ON "AceSchoolVolunteerReservation"("tenantId", "academicPeriodId", "date");
CREATE INDEX "AceSchoolVolunteerReservation_tenantId_guardianIdentityId_d_idx"
  ON "AceSchoolVolunteerReservation"("tenantId", "guardianIdentityId", "date");
CREATE UNIQUE INDEX "AceSchoolVolunteerReservation_active_slot_key"
  ON "AceSchoolVolunteerReservation"("tenantId", "date", "slot")
  WHERE "cancelledAt" IS NULL;
CREATE UNIQUE INDEX "AceSchoolVolunteerReservation_active_guardian_date_key"
  ON "AceSchoolVolunteerReservation"("tenantId", "guardianIdentityId", "date")
  WHERE "cancelledAt" IS NULL;

CREATE FUNCTION app.require_ace_school_volunteer_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  valid_day boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Volunteer reservations cannot be deleted' USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW."id" IS DISTINCT FROM OLD."id"
      OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
      OR NEW."guardianIdentityId" IS DISTINCT FROM OLD."guardianIdentityId"
      OR NEW."academicPeriodId" IS DISTINCT FROM OLD."academicPeriodId"
      OR NEW."date" IS DISTINCT FROM OLD."date"
      OR NEW."slot" IS DISTINCT FROM OLD."slot"
      OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
      OR OLD."cancelledAt" IS NOT NULL
      OR NEW."cancelledAt" IS NULL THEN
      RAISE EXCEPTION 'Volunteer reservation identity and cancellation are immutable'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    EXECUTE pg_catalog.format(
      'SELECT EXISTS (
        SELECT 1 FROM %1$I."AcademicPeriod" period
        JOIN %1$I."Tenant" site ON site."id" = period."tenantId"
        JOIN %1$I."OrgVertical" vertical
          ON vertical."orgId" = site."orgId"
         AND vertical."vertical" = ''ACE_SCHOOL''
        JOIN %1$I."AceTeachingDate" day
          ON day."tenantId" = period."tenantId"
         AND day."academicYearId" = period."academicYearId"
         AND day."date" = $3
        WHERE period."id" = $1 AND period."tenantId" = $2
          AND period."status" = ''ACTIVE''
          AND $3 BETWEEN period."startsOn" AND period."endsOn"
          AND day."kind" IN (''TEACHING'', ''EXCEPTIONAL_OPEN'')
      )', TG_TABLE_SCHEMA
    ) INTO valid_day USING NEW."academicPeriodId", NEW."tenantId", NEW."date";
    IF NOT valid_day THEN
      RAISE EXCEPTION 'Volunteer reservation requires an open teaching day in an active period'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.require_ace_school_volunteer_scope() FROM PUBLIC;
CREATE TRIGGER "AceSchoolVolunteerReservation_require_scope"
BEFORE INSERT OR UPDATE OR DELETE ON "AceSchoolVolunteerReservation"
FOR EACH ROW EXECUTE FUNCTION app.require_ace_school_volunteer_scope();

ALTER TABLE "AceSchoolVolunteerReservation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AceSchoolVolunteerReservation" FORCE ROW LEVEL SECURITY;

CREATE POLICY "AceSchoolVolunteerReservation_select" ON "AceSchoolVolunteerReservation"
  FOR SELECT USING (
    "tenantId" = app.current_tenant_id()
    AND (
      (current_setting('app.ace_volunteer_staff_view', true) = 'on'
        AND EXISTS (
          SELECT 1 FROM "User" actor
          JOIN "Tenant" site ON site."id" = "AceSchoolVolunteerReservation"."tenantId"
          WHERE actor."id" = NULLIF(current_setting('app.user_id', true), '')
            AND actor."isActive" = true
            AND (
              actor."superUser" = true
              OR EXISTS (
                SELECT 1 FROM "SiteMembership" membership
                WHERE membership."tenantId" = site."id"
                  AND membership."userId" = actor."id"
                  AND membership."role" IN ('STAFF', 'SITE_ADMIN')
              )
              OR EXISTS (
                SELECT 1 FROM "UserTenantRole" role
                WHERE role."tenantId" = site."id"
                  AND role."userId" = actor."id"
                  AND role."role" IN ('ADMIN', 'COORDINATOR', 'TEACHER', 'LEAD', 'SUPPORT')
              )
              OR EXISTS (
                SELECT 1 FROM "OrgMembership" membership
                WHERE membership."orgId" = site."orgId"
                  AND membership."userId" = actor."id"
                  AND membership."role" = 'ORG_ADMIN'
              )
              OR EXISTS (
                SELECT 1 FROM "UserOrgRole" role
                WHERE role."orgId" = site."orgId"
                  AND role."userId" = actor."id"
                  AND role."role" = 'ORG_ADMIN'
              )
              OR EXISTS (
                SELECT 1 FROM "UserRoleAssignment" assignment
                JOIN "OrgRoleDefinition" definition
                  ON definition."id" = assignment."roleDefinitionId"
                WHERE assignment."userId" = actor."id"
                  AND assignment."orgId" = site."orgId"
                  AND assignment."roleDefinitionId" IN (
                    'system-role:' || site."orgId" || ':organisation:organisationHead',
                    'system-role:' || site."orgId" || ':' || site."id" || ':siteLead'
                  )
                  AND definition."isSystem" = true
                  AND definition."isActive" = true
                  AND assignment."startsAt" <= CURRENT_TIMESTAMP
                  AND (assignment."expiresAt" IS NULL OR assignment."expiresAt" > CURRENT_TIMESTAMP)
                  AND assignment."revokedAt" IS NULL
              )
            )
        ))
      OR EXISTS (
        SELECT 1 FROM "GuardianIdentity" guardian
        JOIN "GuardianChildRelationship" relationship
          ON relationship."guardianIdentityId" = guardian."id"
         AND relationship."tenantId" = guardian."tenantId"
        JOIN "Child" child ON child."id" = relationship."childId"
        WHERE guardian."id" = "AceSchoolVolunteerReservation"."guardianIdentityId"
          AND guardian."tenantId" = "AceSchoolVolunteerReservation"."tenantId"
          AND guardian."userId" = NULLIF(current_setting('app.user_id', true), '')
          AND relationship."legalAccess" = 'FULL'
          AND relationship."startsAt" <= CURRENT_TIMESTAMP
          AND relationship."endedAt" IS NULL
          AND relationship."revokedAt" IS NULL
          AND child."tenantId" = relationship."tenantId"
          AND child."isGuest" = false
      )
    )
  );
CREATE POLICY "AceSchoolVolunteerReservation_insert" ON "AceSchoolVolunteerReservation"
  FOR INSERT WITH CHECK (
    "tenantId" = app.current_tenant_id()
    AND "cancelledAt" IS NULL
    AND EXISTS (
      SELECT 1 FROM "GuardianIdentity" guardian
      JOIN "GuardianChildRelationship" relationship
        ON relationship."guardianIdentityId" = guardian."id"
       AND relationship."tenantId" = guardian."tenantId"
      JOIN "Child" child ON child."id" = relationship."childId"
      WHERE guardian."id" = "AceSchoolVolunteerReservation"."guardianIdentityId"
        AND guardian."tenantId" = "AceSchoolVolunteerReservation"."tenantId"
        AND guardian."userId" = NULLIF(current_setting('app.user_id', true), '')
        AND relationship."legalAccess" = 'FULL'
        AND relationship."startsAt" <= CURRENT_TIMESTAMP
        AND relationship."endedAt" IS NULL
        AND relationship."revokedAt" IS NULL
        AND child."tenantId" = relationship."tenantId"
        AND child."isGuest" = false
    )
  );
CREATE POLICY "AceSchoolVolunteerReservation_update" ON "AceSchoolVolunteerReservation"
  FOR UPDATE USING (
    "tenantId" = app.current_tenant_id()
    AND (
      (current_setting('app.ace_volunteer_manager', true) = 'on'
        AND EXISTS (
          SELECT 1 FROM "User" actor
          JOIN "Tenant" site ON site."id" = "AceSchoolVolunteerReservation"."tenantId"
          WHERE actor."id" = NULLIF(current_setting('app.user_id', true), '')
            AND actor."isActive" = true
            AND (
              actor."superUser" = true
              OR EXISTS (
                SELECT 1 FROM "SiteMembership" membership
                WHERE membership."tenantId" = site."id"
                  AND membership."userId" = actor."id"
                  AND membership."role" = 'SITE_ADMIN'
              )
              OR EXISTS (
                SELECT 1 FROM "OrgMembership" membership
                WHERE membership."orgId" = site."orgId"
                  AND membership."userId" = actor."id"
                  AND membership."role" = 'ORG_ADMIN'
              )
              OR EXISTS (
                SELECT 1 FROM "UserOrgRole" role
                WHERE role."orgId" = site."orgId"
                  AND role."userId" = actor."id"
                  AND role."role" = 'ORG_ADMIN'
              )
              OR EXISTS (
                SELECT 1 FROM "UserRoleAssignment" assignment
                JOIN "OrgRoleDefinition" definition
                  ON definition."id" = assignment."roleDefinitionId"
                WHERE assignment."userId" = actor."id"
                  AND assignment."orgId" = site."orgId"
                  AND assignment."roleDefinitionId" IN (
                    'system-role:' || site."orgId" || ':organisation:organisationHead',
                    'system-role:' || site."orgId" || ':' || site."id" || ':siteLead'
                  )
                  AND definition."isSystem" = true
                  AND definition."isActive" = true
                  AND assignment."startsAt" <= CURRENT_TIMESTAMP
                  AND (assignment."expiresAt" IS NULL OR assignment."expiresAt" > CURRENT_TIMESTAMP)
                  AND assignment."revokedAt" IS NULL
              )
            )
        ))
      OR EXISTS (
        SELECT 1 FROM "GuardianIdentity" guardian
        JOIN "GuardianChildRelationship" relationship
          ON relationship."guardianIdentityId" = guardian."id"
         AND relationship."tenantId" = guardian."tenantId"
        JOIN "Child" child ON child."id" = relationship."childId"
        WHERE guardian."id" = "AceSchoolVolunteerReservation"."guardianIdentityId"
          AND guardian."tenantId" = "AceSchoolVolunteerReservation"."tenantId"
          AND guardian."userId" = NULLIF(current_setting('app.user_id', true), '')
          AND relationship."legalAccess" = 'FULL'
          AND relationship."startsAt" <= CURRENT_TIMESTAMP
          AND relationship."endedAt" IS NULL
          AND relationship."revokedAt" IS NULL
          AND child."tenantId" = relationship."tenantId"
          AND child."isGuest" = false
      )
    )
  ) WITH CHECK (
    "tenantId" = app.current_tenant_id()
    AND "cancelledByUserId" = NULLIF(current_setting('app.user_id', true), '')
  );

-- Only the private API database role may call this. It exposes dates and slot
-- numbers for capacity calculations, without exposing guardian identities.
CREATE FUNCTION app.ace_school_volunteer_occupied_slots(
  site_id text, period_id text
)
RETURNS TABLE("date" date, "slot" integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  data_schema text;
BEGIN
  IF site_id IS DISTINCT FROM app.current_tenant_id() THEN
    RETURN;
  END IF;
  SELECT namespace.nspname INTO data_schema
  FROM pg_catalog.pg_class relation
  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
  WHERE relation.relname = 'AceSchoolVolunteerReservation'
    AND relation.relkind IN ('r', 'p')
    AND namespace.nspname IN ('public', 'app')
  ORDER BY (namespace.nspname = 'public') DESC
  LIMIT 1;
  IF data_schema IS NULL THEN
    RAISE EXCEPTION 'Volunteer reservation table is unavailable'
      USING ERRCODE = 'undefined_table';
  END IF;
  RETURN QUERY EXECUTE pg_catalog.format(
    'SELECT "date", "slot" FROM %I."AceSchoolVolunteerReservation"
     WHERE "tenantId" = $1 AND "academicPeriodId" = $2
       AND "cancelledAt" IS NULL', data_schema
  ) USING site_id, period_id;
END;
$$;
REVOKE ALL ON FUNCTION app.ace_school_volunteer_occupied_slots(text, text) FROM PUBLIC;
DO $$
BEGIN
  IF pg_catalog.to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION app.ace_school_volunteer_occupied_slots(text, text) FROM anon';
  END IF;
  IF pg_catalog.to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION app.ace_school_volunteer_occupied_slots(text, text) FROM authenticated';
  END IF;
END;
$$;

REVOKE ALL PRIVILEGES ON TABLE "AceSchoolVolunteerReservation" FROM PUBLIC;
DO $$
BEGIN
  IF pg_catalog.to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "AceSchoolVolunteerReservation" FROM anon';
  END IF;
  IF pg_catalog.to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "AceSchoolVolunteerReservation" FROM authenticated';
  END IF;
END;
$$;

COMMIT;
