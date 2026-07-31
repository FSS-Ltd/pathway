-- The system-role seeder writes SYSTEM_ACTOR_ID ('00000000-0000-0000-0000-
-- 000000000000') into OrgRoleDefinition/OrgRolePermission createdById/
-- updatedById/grantedById, but those are plain string columns with no FK.
-- UserRoleAssignment.assignedById is a real FK to "User", so a platform-made
-- grant (e.g. the ACE-F14 legacy ORG_ADMIN backfill) needs a durable actor
-- row to reference. Idempotent: safe to apply more than once.
INSERT INTO "User" ("id", "email", "name", "createdAt", "updatedAt")
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'system@pathway.invalid',
  'Pathway platform',
  NOW(),
  NOW()
)
ON CONFLICT ("id") DO NOTHING;
