import { configureCiRlsRole } from "./test.global-setup.e2e";

describe("configureCiRlsRole", () => {
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

    expect(statements).toHaveLength(12);
    expect(statements[0]).toContain('CREATE ROLE "pathway_e2e_rls"');
    expect(statements).toEqual(
      expect.arrayContaining([
        'REVOKE ALL PRIVILEGES ON SCHEMA app FROM "pathway_e2e_rls";',
        'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA app FROM "pathway_e2e_rls";',
        'GRANT USAGE ON SCHEMA app TO "pathway_e2e_rls";',
        'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "OrgRoleDefinition" TO "pathway_e2e_rls";',
        'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "OrgRolePermission" TO "pathway_e2e_rls";',
        'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "UserRoleAssignment" TO "pathway_e2e_rls";',
        'GRANT SELECT ON TABLE "PermissionDefinition" TO "pathway_e2e_rls";',
        'GRANT SELECT ON TABLE "OrgMembership" TO "pathway_e2e_rls";',
        'GRANT SELECT ON TABLE "OrgVertical" TO "pathway_e2e_rls";',
        'GRANT SELECT ON TABLE "OrgModule" TO "pathway_e2e_rls";',
        'GRANT "pathway_e2e_rls" TO "pathway_test_user";',
      ]),
    );
    expect(statements.join("\n")).not.toMatch(
      /"SiteMembership"|"User"/,
    );
  });
});
