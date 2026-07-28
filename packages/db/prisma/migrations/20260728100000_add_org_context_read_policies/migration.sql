-- The Supabase direct-access hardening migration enables RLS on every app
-- table. These organisation-scoped records therefore need explicit read
-- policies for the dedicated operational connection used by access checks.

ALTER TABLE "OrgMembership" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "OrgMembership_org_context_read"
  ON "OrgMembership"
  FOR SELECT
  USING (
    app.current_org_id() IS NOT NULL
    AND "orgId" = app.current_org_id()
  );

ALTER TABLE "OrgVertical" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "OrgVertical_org_context_read"
  ON "OrgVertical"
  FOR SELECT
  USING (
    app.current_org_id() IS NOT NULL
    AND "orgId" = app.current_org_id()
  );

ALTER TABLE "OrgModule" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "OrgModule_org_context_read"
  ON "OrgModule"
  FOR SELECT
  USING (
    app.current_org_id() IS NOT NULL
    AND "orgId" = app.current_org_id()
  );

REVOKE ALL PRIVILEGES ON TABLE "OrgMembership" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "OrgVertical" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "OrgModule" FROM PUBLIC;

DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    REVOKE ALL PRIVILEGES ON TABLE "OrgMembership" FROM anon;
    REVOKE ALL PRIVILEGES ON TABLE "OrgVertical" FROM anon;
    REVOKE ALL PRIVILEGES ON TABLE "OrgModule" FROM anon;
  END IF;

  IF to_regrole('authenticated') IS NOT NULL THEN
    REVOKE ALL PRIVILEGES ON TABLE "OrgMembership" FROM authenticated;
    REVOKE ALL PRIVILEGES ON TABLE "OrgVertical" FROM authenticated;
    REVOKE ALL PRIVILEGES ON TABLE "OrgModule" FROM authenticated;
  END IF;
END;
$$;
