-- ACE student identity and guardian relationship foundation. Authentication
-- remains global; every access-bearing relationship is tenant-scoped and RLS
-- protected. This migration does not add a portal, façade, or API endpoint.

CREATE TYPE "GuardianLegalAccess" AS ENUM ('FULL', 'LIMITED', 'NONE');
CREATE TYPE "FamilyIdentityTarget" AS ENUM ('GUARDIAN', 'STUDENT');

CREATE TABLE "StudentPortalPolicy" (
  "tenantId" TEXT NOT NULL,
  "studentPortalEnabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StudentPortalPolicy_pkey" PRIMARY KEY ("tenantId"),
  CONSTRAINT "StudentPortalPolicy_tenant_fk"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "GuardianIdentity" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GuardianIdentity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GuardianIdentity_id_tenant_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "GuardianIdentity_tenant_user_key" UNIQUE ("tenantId", "userId"),
  CONSTRAINT "GuardianIdentity_id_tenant_user_key"
    UNIQUE ("id", "tenantId", "userId"),
  CONSTRAINT "GuardianIdentity_tenant_fk"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GuardianIdentity_user_fk"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "StudentIdentity" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StudentIdentity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudentIdentity_id_tenant_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "StudentIdentity_tenant_user_key" UNIQUE ("tenantId", "userId"),
  CONSTRAINT "StudentIdentity_id_tenant_user_key"
    UNIQUE ("id", "tenantId", "userId"),
  CONSTRAINT "StudentIdentity_tenant_fk"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StudentIdentity_user_fk"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "StudentIdentityLink" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "studentIdentityId" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "revokedByUserId" TEXT,
  "revocationReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StudentLink_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudentLink_id_tenant_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "StudentLink_end_after_start_check"
    CHECK ("endedAt" IS NULL OR "endedAt" > "linkedAt"),
  CONSTRAINT "StudentLink_revoke_after_start_check"
    CHECK ("revokedAt" IS NULL OR "revokedAt" >= "linkedAt"),
  CONSTRAINT "StudentLink_single_terminal_state_check"
    CHECK ("endedAt" IS NULL OR "revokedAt" IS NULL),
  CONSTRAINT "StudentLink_revoke_metadata_check" CHECK (
    ("revokedAt" IS NULL AND "revokedByUserId" IS NULL AND "revocationReason" IS NULL)
    OR (
      "revokedAt" IS NOT NULL
      AND "revokedByUserId" IS NOT NULL
      AND "revocationReason" IS NOT NULL
      AND btrim("revocationReason") <> ''
    )
  ),
  CONSTRAINT "StudentLink_tenant_fk"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StudentLink_identity_tenant_fk"
    FOREIGN KEY ("studentIdentityId", "tenantId")
    REFERENCES "StudentIdentity"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StudentLink_child_tenant_fk"
    FOREIGN KEY ("childId", "tenantId") REFERENCES "Child"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StudentLink_revoker_fk"
    FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "GuardianChildRelationship" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "guardianIdentityId" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "legalAccess" "GuardianLegalAccess" NOT NULL DEFAULT 'FULL',
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "revokedByUserId" TEXT,
  "revocationReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GuardianChildRel_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GuardianChildRel_id_tenant_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "GuardianChildRel_end_after_start_check"
    CHECK ("endedAt" IS NULL OR "endedAt" > "startsAt"),
  CONSTRAINT "GuardianChildRel_revoke_after_start_check"
    CHECK ("revokedAt" IS NULL OR "revokedAt" >= "startsAt"),
  CONSTRAINT "GuardianChildRel_single_terminal_state_check"
    CHECK ("endedAt" IS NULL OR "revokedAt" IS NULL),
  CONSTRAINT "GuardianChildRel_revoke_metadata_check" CHECK (
    ("revokedAt" IS NULL AND "revokedByUserId" IS NULL AND "revocationReason" IS NULL)
    OR (
      "revokedAt" IS NOT NULL
      AND "revokedByUserId" IS NOT NULL
      AND "revocationReason" IS NOT NULL
      AND btrim("revocationReason") <> ''
    )
  ),
  CONSTRAINT "GuardianChildRel_tenant_fk"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GuardianChildRel_identity_tenant_fk"
    FOREIGN KEY ("guardianIdentityId", "tenantId")
    REFERENCES "GuardianIdentity"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GuardianChildRel_child_tenant_fk"
    FOREIGN KEY ("childId", "tenantId") REFERENCES "Child"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GuardianChildRel_revoker_fk"
    FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "FamilyIdentityInvite" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "invitedUserId" TEXT NOT NULL,
  "target" "FamilyIdentityTarget" NOT NULL,
  "childId" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "acceptedGuardianIdentityId" TEXT,
  "acceptedStudentIdentityId" TEXT,
  "revokedAt" TIMESTAMP(3),
  "revokedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FamilyInvite_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FamilyInvite_id_tenant_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "FamilyInvite_accept_before_expiry_check"
    CHECK ("acceptedAt" IS NULL OR "acceptedAt" <= "expiresAt"),
  CONSTRAINT "FamilyInvite_not_accepted_and_revoked_check"
    CHECK ("acceptedAt" IS NULL OR "revokedAt" IS NULL),
  CONSTRAINT "FamilyInvite_revoker_metadata_check"
    CHECK (
      ("revokedAt" IS NULL AND "revokedByUserId" IS NULL)
      OR ("revokedAt" IS NOT NULL AND "revokedByUserId" IS NOT NULL)
    ),
  CONSTRAINT "FamilyInvite_accepted_identity_check" CHECK (
    ("acceptedAt" IS NULL
      AND "acceptedGuardianIdentityId" IS NULL
      AND "acceptedStudentIdentityId" IS NULL)
    OR ("acceptedAt" IS NOT NULL AND (
      ("target" = 'GUARDIAN'
        AND "acceptedGuardianIdentityId" IS NOT NULL
        AND "acceptedStudentIdentityId" IS NULL)
      OR ("target" = 'STUDENT'
        AND "acceptedStudentIdentityId" IS NOT NULL
        AND "acceptedGuardianIdentityId" IS NULL)
    ))
  ),
  CONSTRAINT "FamilyInvite_tenant_fk"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FamilyInvite_invited_user_fk"
    FOREIGN KEY ("invitedUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FamilyInvite_child_tenant_fk"
    FOREIGN KEY ("childId", "tenantId") REFERENCES "Child"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FamilyInvite_creator_fk"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FamilyInvite_revoker_fk"
    FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FamilyInvite_acc_guardian_fk"
    FOREIGN KEY ("acceptedGuardianIdentityId", "tenantId", "invitedUserId")
    REFERENCES "GuardianIdentity"("id", "tenantId", "userId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FamilyInvite_acc_student_fk"
    FOREIGN KEY ("acceptedStudentIdentityId", "tenantId", "invitedUserId")
    REFERENCES "StudentIdentity"("id", "tenantId", "userId")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "GuardianIdentity_tenantId_idx" ON "GuardianIdentity"("tenantId");
CREATE INDEX "GuardianIdentity_userId_idx" ON "GuardianIdentity"("userId");
CREATE INDEX "StudentIdentity_tenantId_idx" ON "StudentIdentity"("tenantId");
CREATE INDEX "StudentIdentity_userId_idx" ON "StudentIdentity"("userId");
CREATE INDEX "StudentIdentityLink_tenantId_childId_idx"
  ON "StudentIdentityLink"("tenantId", "childId");
CREATE INDEX "StudentIdentityLink_tenantId_studentIdentityId_idx"
  ON "StudentIdentityLink"("tenantId", "studentIdentityId");
CREATE UNIQUE INDEX "StudentIdentityLink_active_child_key"
  ON "StudentIdentityLink"("tenantId", "childId")
  WHERE "endedAt" IS NULL AND "revokedAt" IS NULL;
CREATE UNIQUE INDEX "StudentIdentityLink_active_identity_key"
  ON "StudentIdentityLink"("tenantId", "studentIdentityId")
  WHERE "endedAt" IS NULL AND "revokedAt" IS NULL;
CREATE INDEX "GuardianChildRelationship_tenantId_childId_idx"
  ON "GuardianChildRelationship"("tenantId", "childId");
CREATE INDEX "GuardianChildRelationship_tenantId_guardianIdentityId_idx"
  ON "GuardianChildRelationship"("tenantId", "guardianIdentityId");
CREATE UNIQUE INDEX "GuardianChildRelationship_active_guardian_child_key"
  ON "GuardianChildRelationship"("tenantId", "guardianIdentityId", "childId")
  WHERE "endedAt" IS NULL AND "revokedAt" IS NULL;
CREATE INDEX "FamilyIdentityInvite_tenantId_invitedUserId_createdAt_idx"
  ON "FamilyIdentityInvite"("tenantId", "invitedUserId", "createdAt");
CREATE INDEX "FamilyIdentityInvite_tenantId_childId_idx"
  ON "FamilyIdentityInvite"("tenantId", "childId");
CREATE INDEX "FamilyIdentityInvite_expiresAt_idx"
  ON "FamilyIdentityInvite"("expiresAt");

-- New active student links are allowed only after an explicit tenant policy.
-- Ended or revoked links remain mutable even if the policy is later disabled,
-- so an operator can close their lifecycle safely.
CREATE FUNCTION app.require_student_portal_link_policy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW."endedAt" IS NULL AND NEW."revokedAt" IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM app."StudentPortalPolicy"
      WHERE "tenantId" = NEW."tenantId"
        AND "studentPortalEnabled"
    )
  THEN
    RAISE EXCEPTION 'Active student identity links require an enabled student portal policy'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.require_student_portal_link_policy() FROM PUBLIC;

CREATE TRIGGER "StudentIdentityLink_require_enabled_policy"
BEFORE INSERT OR UPDATE OF "tenantId", "endedAt", "revokedAt"
ON "StudentIdentityLink"
FOR EACH ROW EXECUTE FUNCTION app.require_student_portal_link_policy();

-- Relationship targets are immutable once created. Lifecycle transitions and
-- guardian legal-access changes remain explicit updates to the original fact.
CREATE FUNCTION app.reject_student_identity_link_scope_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."studentIdentityId" IS DISTINCT FROM OLD."studentIdentityId"
    OR NEW."childId" IS DISTINCT FROM OLD."childId"
  THEN
    RAISE EXCEPTION 'Student identity link tenant and targets are immutable'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION app.reject_guardian_child_relationship_scope_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."guardianIdentityId" IS DISTINCT FROM OLD."guardianIdentityId"
    OR NEW."childId" IS DISTINCT FROM OLD."childId"
  THEN
    RAISE EXCEPTION 'Guardian-child relationship tenant and targets are immutable'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.reject_student_identity_link_scope_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.reject_guardian_child_relationship_scope_mutation() FROM PUBLIC;

CREATE TRIGGER "StudentIdentityLink_reject_scope_mutation"
BEFORE UPDATE OF "tenantId", "studentIdentityId", "childId"
ON "StudentIdentityLink"
FOR EACH ROW EXECUTE FUNCTION app.reject_student_identity_link_scope_mutation();
CREATE TRIGGER "GuardianChildRelationship_reject_scope_mutation"
BEFORE UPDATE OF "tenantId", "guardianIdentityId", "childId"
ON "GuardianChildRelationship"
FOR EACH ROW EXECUTE FUNCTION app.reject_guardian_child_relationship_scope_mutation();

-- Every table owns a tenant id and is inaccessible without app.tenant_id.
DO $$
DECLARE
  tbl text;
  policy_name text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'StudentPortalPolicy',
    'GuardianIdentity',
    'StudentIdentity',
    'StudentIdentityLink',
    'GuardianChildRelationship',
    'FamilyIdentityInvite'
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
