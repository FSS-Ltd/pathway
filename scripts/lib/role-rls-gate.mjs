const REQUIRED_QUALIFIER_BY_TABLE = {
  PermissionDefinition: "true",
  OrgRoleDefinition:
    '((current_org_id() IS NOT NULL) AND ("orgId" = current_org_id()) AND (("tenantId" IS NULL) OR ("tenantId" = current_tenant_id())))',
  OrgRolePermission:
    '(EXISTS ( SELECT 1 FROM "OrgRoleDefinition" role_definition WHERE ((role_definition.id = "OrgRolePermission"."roleDefinitionId") AND (role_definition."orgId" = current_org_id()) AND ((role_definition."tenantId" IS NULL) OR (role_definition."tenantId" = current_tenant_id())))))',
  OrgRoleRevision:
    '((current_org_id() IS NOT NULL) AND ("orgId" = current_org_id()) AND (("tenantId" IS NULL) OR ("tenantId" = current_tenant_id())))',
  AuditEvent:
    '((current_org_id() IS NOT NULL) AND ("orgId" = current_org_id()) AND (("tenantId" IS NULL) OR ("tenantId" = current_tenant_id())))',
  UserRoleAssignment:
    '((current_org_id() IS NOT NULL) AND ("orgId" = current_org_id()) AND (("tenantId" IS NULL) OR ("tenantId" = current_tenant_id())))',
  OutboxEvent:
    '((current_org_id() IS NOT NULL) AND ("orgId" = current_org_id()))',
};
const REQUIRED_ASSIGNMENT_SELECT_QUALIFIER =
  '((current_org_id() IS NOT NULL) AND ("orgId" = current_org_id()) AND ((current_setting(\'app.assignment_org_read\'::text, true) = \'on\'::text) OR ("tenantId" IS NULL) OR ("tenantId" = current_tenant_id())))';

const REVIEWED_ROLE_POLICIES = [
  reviewedPolicy(
    "PermissionDefinition",
    "PermissionDefinition_global_read",
    "PermissionDefinition",
    undefined,
    { command: "r", check_qualifier: null },
  ),
  reviewedPolicy(
    "PermissionDefinition",
    "PermissionDefinition_system_role_seed",
    undefined,
    "(SESSION_USER = 'pathway_system_role_seed'::name)",
  ),
  reviewedPolicy("AuditEvent", "AuditEvent_org_or_site_rls", "AuditEvent"),
  reviewedPolicy("OrgRoleDefinition", "OrgRoleDefinition_rls", "OrgRoleDefinition"),
  reviewedPolicy(
    "OrgRoleDefinition",
    "OrgRoleDefinition_system_role_seed",
    undefined,
    '((SESSION_USER = \'pathway_system_role_seed\'::name) AND "isSystem")',
  ),
  reviewedPolicy("OrgRolePermission", "OrgRolePermission_rls", "OrgRolePermission"),
  reviewedPolicy(
    "OrgRolePermission",
    "OrgRolePermission_system_role_seed",
    undefined,
    '((SESSION_USER = \'pathway_system_role_seed\'::name) AND (EXISTS ( SELECT 1 FROM "OrgRoleDefinition" role_definition WHERE ((role_definition.id = "OrgRolePermission"."roleDefinitionId") AND role_definition."isSystem"))))',
  ),
  reviewedPolicy("OrgRoleRevision", "OrgRoleRevision_rls", "OrgRoleRevision"),
  reviewedPolicy("OutboxEvent", "OutboxEvent_rls", "OutboxEvent"),
  reviewedPolicy(
    "UserRoleAssignment",
    "UserRoleAssignment_rls_select",
    undefined,
    REQUIRED_ASSIGNMENT_SELECT_QUALIFIER,
    { command: "r", check_qualifier: null },
  ),
  reviewedPolicy(
    "UserRoleAssignment",
    "UserRoleAssignment_rls_insert",
    undefined,
    null,
    {
      command: "a",
      using_qualifier: null,
      check_qualifier: REQUIRED_QUALIFIER_BY_TABLE.UserRoleAssignment,
    },
  ),
  reviewedPolicy(
    "UserRoleAssignment",
    "UserRoleAssignment_rls_update",
    "UserRoleAssignment",
    undefined,
    { command: "w" },
  ),
];

export function findRequiredTableEntries(entries, requiredTableNames) {
  const required = new Set(requiredTableNames);
  return entries.filter((entry) => required.has(entry.table_name));
}

export function hasRequiredRolePolicyQualifiers(tableName, policy) {
  return (
    hasRequiredPolicyQualifier(tableName, policy.using_qualifier) &&
    hasRequiredPolicyQualifier(tableName, policy.check_qualifier)
  );
}

export function findUnreviewedRolePolicies(policies) {
  const reviewedByKey = new Map(
    REVIEWED_ROLE_POLICIES.map((policy) => [policyKey(policy), policy]),
  );
  const matchedPolicyKeys = new Set();
  const unreviewedPolicyKeys = new Set();

  for (const policy of policies) {
    const key = policyKey(policy);
    const reviewed = reviewedByKey.get(key);
    if (!reviewed || !isReviewedPolicy(policy, reviewed) || matchedPolicyKeys.has(key)) {
      unreviewedPolicyKeys.add(key);
      continue;
    }
    matchedPolicyKeys.add(key);
  }

  for (const policy of REVIEWED_ROLE_POLICIES) {
    const key = policyKey(policy);
    if (!matchedPolicyKeys.has(key)) unreviewedPolicyKeys.add(key);
  }

  return [...unreviewedPolicyKeys].sort();
}

function reviewedPolicy(
  table_name,
  policy_name,
  qualifierTable,
  qualifier,
  overrides = {},
) {
  const expectedQualifier = qualifier ?? REQUIRED_QUALIFIER_BY_TABLE[qualifierTable];
  return {
    table_name,
    policy_name,
    command: "*",
    permissive: true,
    roles: ["PUBLIC"],
    using_qualifier: expectedQualifier,
    check_qualifier: expectedQualifier,
    ...overrides,
  };
}

function isReviewedPolicy(policy, reviewed) {
  return (
    policy.command === reviewed.command &&
    policy.permissive === reviewed.permissive &&
    sameRoles(policy.roles, reviewed.roles) &&
    sameQualifier(policy.using_qualifier, reviewed.using_qualifier) &&
    sameQualifier(policy.check_qualifier, reviewed.check_qualifier)
  );
}

function sameRoles(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    [...actual].sort().every((role, index) => role === expected[index])
  );
}

function sameQualifier(actual, expected) {
  if (actual === null || expected === null) return actual === expected;
  return typeof actual === "string" && canonicalizeQualifier(actual) === expected;
}

function policyKey(policy) {
  return `${policy.table_name}.${policy.policy_name}`;
}

function hasRequiredPolicyQualifier(tableName, qualifier) {
  const expected = REQUIRED_QUALIFIER_BY_TABLE[tableName];
  return sameQualifier(qualifier, expected);
}

function canonicalizeQualifier(qualifier) {
  return qualifier
    .replaceAll("app.current_org_id", "current_org_id")
    .replaceAll("app.current_tenant_id", "current_tenant_id")
    .replaceAll('app."OrgRoleDefinition"', '"OrgRoleDefinition"')
    .replace(/\s+/g, " ")
    .trim();
}
