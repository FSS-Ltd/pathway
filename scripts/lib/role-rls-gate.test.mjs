import assert from "node:assert/strict";
import test from "node:test";
import {
  findRequiredTableEntries,
  findUnreviewedRolePolicies,
  hasRequiredRolePolicyQualifiers,
} from "./role-rls-gate.mjs";

const REQUIRED_TABLES = [
  "PermissionDefinition",
  "OrgRoleDefinition",
  "OrgRolePermission",
  "OrgRoleRevision",
  "UserRoleAssignment",
  "AuditEvent",
];
const reviewedRoleQualifier =
  '((current_org_id() IS NOT NULL) AND ("orgId" = current_org_id()) AND (("tenantId" IS NULL) OR ("tenantId" = current_tenant_id())))';
const reviewedRolePermissionQualifier =
  '(EXISTS ( SELECT 1 FROM "OrgRoleDefinition" role_definition WHERE ((role_definition.id = "OrgRolePermission"."roleDefinitionId") AND (role_definition."orgId" = current_org_id()) AND ((role_definition."tenantId" IS NULL) OR (role_definition."tenantId" = current_tenant_id())))))';
const reviewedSystemRoleDefinitionQualifier =
  '((SESSION_USER = \'pathway_system_role_seed\'::name) AND "isSystem")';
const reviewedSystemRolePermissionQualifier =
  '((SESSION_USER = \'pathway_system_role_seed\'::name) AND (EXISTS ( SELECT 1 FROM "OrgRoleDefinition" role_definition WHERE ((role_definition.id = "OrgRolePermission"."roleDefinitionId") AND role_definition."isSystem"))))';
const reviewedSystemRoleSeedQualifier =
  "(SESSION_USER = 'pathway_system_role_seed'::name)";

const reviewedPolicies = [
  policy(
    "PermissionDefinition",
    "PermissionDefinition_global_read",
    "true",
    { command: "r", check_qualifier: null },
  ),
  policy(
    "PermissionDefinition",
    "PermissionDefinition_system_role_seed",
    reviewedSystemRoleSeedQualifier,
  ),
  policy("AuditEvent", "AuditEvent_org_or_site_rls", reviewedRoleQualifier),
  policy("OrgRoleDefinition", "OrgRoleDefinition_rls", reviewedRoleQualifier),
  policy(
    "OrgRoleDefinition",
    "OrgRoleDefinition_system_role_seed",
    reviewedSystemRoleDefinitionQualifier,
  ),
  policy("OrgRolePermission", "OrgRolePermission_rls", reviewedRolePermissionQualifier),
  policy(
    "OrgRolePermission",
    "OrgRolePermission_system_role_seed",
    reviewedSystemRolePermissionQualifier,
  ),
  policy("OrgRoleRevision", "OrgRoleRevision_rls", reviewedRoleQualifier),
  policy(
    "UserRoleAssignment",
    "UserRoleAssignment_rls_select",
    reviewedRoleQualifier,
    { command: "r", check_qualifier: null },
  ),
  policy(
    "UserRoleAssignment",
    "UserRoleAssignment_rls_insert",
    null,
    { command: "a", check_qualifier: reviewedRoleQualifier },
  ),
  policy(
    "UserRoleAssignment",
    "UserRoleAssignment_rls_update",
    reviewedRoleQualifier,
    { command: "w" },
  ),
];

function policy(table_name, policy_name, qualifier, overrides = {}) {
  return {
    table_name,
    policy_name,
    command: "*",
    permissive: true,
    roles: ["PUBLIC"],
    using_qualifier: qualifier,
    check_qualifier: qualifier,
    ...overrides,
  };
}

test("identifies disabled required tables without treating unrelated tables as required", () => {
  const disabled = [
    { table_name: "OrgRoleDefinition" },
    { table_name: "ChildGuardianContact" },
  ];

  assert.deepEqual(findRequiredTableEntries(disabled, REQUIRED_TABLES), [
    { table_name: "OrgRoleDefinition" },
  ]);
});

test("identifies PUBLIC grants on required tables", () => {
  const grants = [
    { table_name: "OrgRoleDefinition", grantee: "PUBLIC" },
    { table_name: "ChildGuardianContact", grantee: "PUBLIC" },
  ];

  assert.deepEqual(findRequiredTableEntries(grants, REQUIRED_TABLES), [
    { table_name: "OrgRoleDefinition", grantee: "PUBLIC" },
  ]);
});

test("accepts only the complete reviewed role policy set", () => {
  assert.deepEqual(findUnreviewedRolePolicies(reviewedPolicies), []);
});

test("rejects an extra permissive SELECT policy beside a reviewed ALL policy", () => {
  const policies = [
    ...reviewedPolicies,
    {
      table_name: "OrgRoleDefinition",
      policy_name: "OrgRoleDefinition_extra_select",
      command: "r",
      permissive: true,
      roles: ["PUBLIC"],
      using_qualifier: "true",
      check_qualifier: null,
    },
  ];

  assert.deepEqual(findUnreviewedRolePolicies(policies), [
    "OrgRoleDefinition.OrgRoleDefinition_extra_select",
  ]);
});

test("rejects a missing PermissionDefinition policy", () => {
  assert.deepEqual(
    findUnreviewedRolePolicies(
      reviewedPolicies.filter(
        (entry) =>
          entry.policy_name !== "PermissionDefinition_global_read",
      ),
    ),
    ["PermissionDefinition.PermissionDefinition_global_read"],
  );
});

test("rejects an extra permissive UserRoleAssignment policy", () => {
  const policies = [
    ...reviewedPolicies,
    {
      table_name: "UserRoleAssignment",
      policy_name: "UserRoleAssignment_extra_select",
      command: "r",
      permissive: true,
      roles: ["PUBLIC"],
      using_qualifier: "true",
      check_qualifier: null,
    },
  ];

  assert.deepEqual(findUnreviewedRolePolicies(policies), [
    "UserRoleAssignment.UserRoleAssignment_extra_select",
  ]);
});

test("rejects a changed UserRoleAssignment command-specific qualifier", () => {
  const policies = reviewedPolicies.map((entry) =>
    entry.policy_name === "UserRoleAssignment_rls_insert"
      ? { ...entry, check_qualifier: "true" }
      : entry,
  );

  assert.deepEqual(findUnreviewedRolePolicies(policies), [
    "UserRoleAssignment.UserRoleAssignment_rls_insert",
  ]);
});

test("rejects a policy with a permissive USING qualifier", () => {
  assert.equal(
    hasRequiredRolePolicyQualifiers("OrgRoleDefinition", {
      using_qualifier: "true",
      check_qualifier: reviewedRoleQualifier,
    }),
    false,
  );
});

test("rejects a policy with a permissive WITH CHECK qualifier", () => {
  assert.equal(
    hasRequiredRolePolicyQualifiers("OrgRoleDefinition", {
      using_qualifier: reviewedRoleQualifier,
      check_qualifier: "true",
    }),
    false,
  );
});

test("rejects a policy with a missing USING or WITH CHECK qualifier", () => {
  assert.equal(
    hasRequiredRolePolicyQualifiers("OrgRoleDefinition", {
      check_qualifier: reviewedRoleQualifier,
    }),
    false,
  );
  assert.equal(
    hasRequiredRolePolicyQualifiers("OrgRoleDefinition", {
      using_qualifier: reviewedRoleQualifier,
    }),
    false,
  );
});

test("rejects a permissive disjunction even when it contains the expected tokens", () => {
  assert.equal(
    hasRequiredRolePolicyQualifiers("OrgRoleDefinition", {
      using_qualifier: `(true OR ${reviewedRoleQualifier})`,
      check_qualifier: reviewedRoleQualifier,
    }),
    false,
  );
});

test("rejects a qualifier without the organisation-presence guard", () => {
  assert.equal(
    hasRequiredRolePolicyQualifiers("OrgRoleDefinition", {
      using_qualifier:
        '(("orgId" = current_org_id()) AND (("tenantId" IS NULL) OR ("tenantId" = current_tenant_id())))',
      check_qualifier: reviewedRoleQualifier,
    }),
    false,
  );
});

test("rejects a tenant predicate weakened by an always-true disjunction", () => {
  assert.equal(
    hasRequiredRolePolicyQualifiers("OrgRoleDefinition", {
      using_qualifier:
        '((current_org_id() IS NOT NULL) AND ("orgId" = current_org_id()) AND (("tenantId" IS NULL) OR ("tenantId" = current_tenant_id()) OR true))',
      check_qualifier: reviewedRoleQualifier,
    }),
    false,
  );
});

test("accepts independently scoped USING and WITH CHECK qualifiers", () => {
  assert.equal(
    hasRequiredRolePolicyQualifiers("OrgRoleDefinition", {
      using_qualifier: reviewedRoleQualifier,
      check_qualifier: reviewedRoleQualifier,
    }),
    true,
  );
});

test("accepts the reviewed role-permission predicate after canonicalizing app qualification", () => {
  const qualifier = `
    (EXISTS ( SELECT 1
      FROM app."OrgRoleDefinition" role_definition
      WHERE ((role_definition.id = "OrgRolePermission"."roleDefinitionId")
        AND (role_definition."orgId" = app.current_org_id())
        AND ((role_definition."tenantId" IS NULL)
          OR (role_definition."tenantId" = app.current_tenant_id())))))
  `;

  assert.equal(
    hasRequiredRolePolicyQualifiers("OrgRolePermission", {
      using_qualifier: qualifier,
      check_qualifier: qualifier,
    }),
    true,
  );
});
