import { readFileSync } from "node:fs";
import path from "node:path";
import { configureCiRlsRole } from "./test.global-setup.e2e";

describe("configureCiRlsRole", () => {
  it("runs the shared-database integration profile in one worker", () => {
    const packageJson = JSON.parse(
      readFileSync(path.resolve(__dirname, "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.["test:integration"]).toContain(
      "--runInBand",
    );
  });

  it("selects the provisioned non-bypass role in global-setup test workers", () => {
    const setupSource = readFileSync(
      path.resolve(__dirname, "test.setup.e2e.ts"),
      "utf8",
    );

    expect(setupSource).toContain(
      'process.env.E2E_RLS_ROLE = "pathway_e2e_rls";',
    );
  });

  it("executes each role-provisioning command as a separate prepared statement", async () => {
    const statements: string[] = [];
    let statementInFlight = false;

    await configureCiRlsRole(async (statement) => {
      if (/\$\$;\s*(?:REVOKE|GRANT)\b/s.test(statement)) {
        throw new Error(
          "PostgreSQL rejects multiple prepared-statement commands",
        );
      }
      if (statementInFlight) {
        throw new Error("Role-provisioning commands must execute sequentially");
      }

      statementInFlight = true;
      await new Promise<void>((resolve) => setImmediate(resolve));
      statementInFlight = false;
      statements.push(statement.trim());
    });

    expect(statements).toHaveLength(60);
    expect(statements[0]).toContain('CREATE ROLE "pathway_e2e_rls"');
    expect(statements[18]).toContain(
      'CREATE ROLE "pathway_e2e_outbox_denied"',
    );
    expect(statements[36]).toContain(
      'CREATE ROLE "pathway_e2e_audit_denied"',
    );
    expect(statements[54]).toContain(
      'CREATE ROLE "pathway_e2e_tenant_rls"',
    );
    expect(statements).toEqual(
      expect.arrayContaining([
        'REVOKE ALL PRIVILEGES ON SCHEMA app FROM "pathway_e2e_rls";',
        'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA app FROM "pathway_e2e_rls";',
        'GRANT USAGE ON SCHEMA app TO "pathway_e2e_rls";',
        'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "OrgRoleDefinition" TO "pathway_e2e_rls";',
        'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "OrgRolePermission" TO "pathway_e2e_rls";',
        'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "UserRoleAssignment" TO "pathway_e2e_rls";',
        'GRANT SELECT, INSERT, UPDATE ON TABLE "AccessTagGrant" TO "pathway_e2e_rls";',
        'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "OrgRoleRevision" TO "pathway_e2e_rls";',
        'GRANT SELECT, INSERT ON TABLE "AuditEvent" TO "pathway_e2e_rls";',
        'GRANT SELECT, INSERT ON TABLE "OutboxEvent" TO "pathway_e2e_rls";',
        'GRANT SELECT ON TABLE "Tenant" TO "pathway_e2e_rls";',
        'GRANT SELECT ON TABLE "PermissionDefinition" TO "pathway_e2e_rls";',
        'GRANT SELECT ON TABLE "OrgMembership" TO "pathway_e2e_rls";',
        'GRANT SELECT ON TABLE "SiteMembership" TO "pathway_e2e_rls";',
        'GRANT SELECT ON TABLE "OrgVertical" TO "pathway_e2e_rls";',
        'GRANT SELECT ON TABLE "OrgModule" TO "pathway_e2e_rls";',
        'GRANT "pathway_e2e_rls" TO "pathway_test_user";',
        'GRANT SELECT ON TABLE "OutboxEvent" TO "pathway_e2e_outbox_denied";',
        'GRANT "pathway_e2e_outbox_denied" TO "pathway_test_user";',
        'GRANT SELECT ON TABLE "AuditEvent" TO "pathway_e2e_audit_denied";',
        'GRANT SELECT, INSERT ON TABLE "OutboxEvent" TO "pathway_e2e_audit_denied";',
        'GRANT "pathway_e2e_audit_denied" TO "pathway_test_user";',
        expect.stringContaining('CREATE ROLE "pathway_e2e_tenant_rls"'),
        'REVOKE ALL PRIVILEGES ON SCHEMA app FROM "pathway_e2e_tenant_rls";',
        'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA app FROM "pathway_e2e_tenant_rls";',
        'GRANT USAGE ON SCHEMA app TO "pathway_e2e_tenant_rls";',
        'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO "pathway_e2e_tenant_rls";',
        'GRANT "pathway_e2e_tenant_rls" TO "pathway_test_user";',
      ]),
    );
    expect(statements.join("\n")).not.toContain(
      'GRANT SELECT, INSERT ON TABLE "OutboxEvent" TO "pathway_e2e_outbox_denied";',
    );
    expect(statements.join("\n")).not.toContain(
      'GRANT SELECT, INSERT ON TABLE "AuditEvent" TO "pathway_e2e_audit_denied";',
    );
    expect(statements.join("\n")).not.toMatch(/"User"/);
  });
});
