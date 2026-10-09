#!/usr/bin/env node
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { URL } from "node:url";
import { isPresent, loadEnvFile, resolveEnvFile } from "./lib/env-file.mjs";
import {
  findRequiredTableCopies,
  findRequiredTableEntries,
  findUnreviewedRolePolicies,
} from "./lib/role-rls-gate.mjs";

const args = new Set(process.argv.slice(2));
const strict = args.has("--strict");
const envFile = resolveRlsEnvFile();
const fileEnv = envFile ? loadEnvFile(envFile) : {};
const env = { ...fileEnv, ...process.env };
const databaseUrl = firstPresent(env.E2E_DATABASE_URL, env.DIRECT_URL, env.DATABASE_URL);
const databaseSchema = databaseUrl ? schemaFromDatabaseUrl(databaseUrl) : undefined;
const accepted = isTrue(env.SUPABASE_RLS_GATE_ACCEPTED);
const REQUIRED_RLS_TABLES = [
  "PermissionDefinition",
  "OrgRoleDefinition",
  "OrgRolePermission",
  "OrgRoleRevision",
  "UserRoleAssignment",
  "AccessTagGrant",
  "AuditEvent",
  "OutboxEvent",
  "AcademicYear",
  "AcademicPeriod",
  "AceYearBand",
  "AceStaffYearBandAssignment",
  "AceSchoolEnrollment",
  "AceTeachingDate",
  "AceDailyAttendance",
  "AceDailyAttendanceCorrectionEvent",
  "StudentSubjectEnrollment",
  "PaceAssessment",
  "PaceProgress",
  "PacePolicy",
  "PacePolicyOverride",
  "BehaviourCategory",
  "BehaviourEntry",
  "BehaviourReviewRequest",
  "DemeritPolicy",
  "DemeritStageOverride",
  "StudentPortalPolicy",
  "GuardianIdentity",
  "StudentIdentity",
  "StudentIdentityLink",
  "GuardianChildRelationship",
  "FamilyIdentityInvite",
  "AceTermReport",
  "AceReportCompilation",
  "AceReportDraft",
  "AceReportReview",
  "AceTermReportVersion",
  "FaithAgeBand",
  "FaithContent",
  "FaithContentDraft",
  "FaithContentVersion",
  "FaithContentAudience",
  "FaithReadReceipt",
  "FaithReflection",
  "Trip",
  "TripCheckpoint",
  "TripCheckpointAttendance",
  "PermissionSlip",
  "PermissionSlipVersion",
  "PermissionSlipRecipient",
  "PermissionSlipResponse",
  "PermissionSlipException",
  "PermissionSlipReminder",
  "AceCommunityPolicy",
  "AceCommunityGroup",
  "AceCommunityGroupChildMember",
  "AceCommunityGroupStaffMember",
  "AceCommunityPost",
  "AceCommunityReply",
  "AceCommunityReadCursor",
  "AceCommunityReport",
  "AceCommunityModerationAction",
  "AceCommunitySafeguardingReference",
  "MessageConversation",
  "MessageParticipant",
  "Message",
  "MessageParticipantReadCursor",
  "MessageDelivery",
  "MessageAttachment",
  "AceNotice",
  "AceNoticeAudienceMember",
  "AceNoticeReceipt",
  "AceNoticeAttachment",
  "HouseholdRequirement",
  "EvidenceLink",
  "Correspondence",
  "Jurisdiction",
  "RegulatoryAuthority",
  "RegulatorySource",
  "Requirement",
  "RequirementVersion",
];
await main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[supabase-rls] ${message}`);
  process.exit(1);
});

async function main() {
  console.log(
    `[supabase-rls] source=${envFile ? path.relative(process.cwd(), envFile) : "process environment"} mode=${
      strict ? "strict" : "dry-run"
    }`,
  );

  if (!isPresent(databaseUrl) || !databaseSchema) {
    const message =
      "E2E_DATABASE_URL, DIRECT_URL, or DATABASE_URL is required to check the configured schema RLS state.";
    if (strict) throw new Error(message);
    console.warn(`[supabase-rls] warning: ${message}`);
    return;
  }

  const { PrismaClient } = createRequire(
    path.resolve(process.cwd(), "packages/db/package.json"),
  )("@prisma/client");
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    const queries = await Promise.all([
      prisma.$queryRawUnsafe(`
      SELECT n.nspname AS schema_name, c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname IN ('app', 'public')
        AND c.relkind IN ('r', 'p')
        AND c.relforcerowsecurity = false
        AND c.relname = ANY($1::text[])
      ORDER BY c.relname
    `, REQUIRED_RLS_TABLES),
      prisma.$queryRawUnsafe(`
      SELECT n.nspname AS schema_name, c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname IN ('app', 'public')
        AND c.relkind IN ('r', 'p')
        AND c.relrowsecurity = false
        AND (n.nspname = $1 OR c.relname = ANY($2::text[]))
      ORDER BY c.relname
    `, databaseSchema, REQUIRED_RLS_TABLES),
      prisma.$queryRawUnsafe(`
      SELECT
        tp.table_schema AS schema_name,
        tp.table_name,
        tp.grantee,
        string_agg(tp.privilege_type, ', ' ORDER BY tp.privilege_type) AS privileges
      FROM information_schema.table_privileges tp
      JOIN pg_namespace n ON n.nspname = tp.table_schema
      JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = tp.table_name
      WHERE tp.table_schema IN ('app', 'public')
        AND c.relkind IN ('r', 'p')
        AND tp.grantee IN ('PUBLIC', 'anon', 'authenticated')
        AND (tp.table_schema = $1 OR tp.table_name = ANY($2::text[]))
      GROUP BY tp.table_schema, tp.table_name, tp.grantee
      ORDER BY tp.table_name, tp.grantee
    `, databaseSchema, REQUIRED_RLS_TABLES),
      prisma.$queryRawUnsafe(`
      SELECT n.nspname AS schema_name, c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname IN ('app', 'public')
        AND c.relkind IN ('r', 'p')
        AND c.relname = ANY($1::text[])
      ORDER BY c.relname
    `, REQUIRED_RLS_TABLES),
      prisma.$queryRawUnsafe(`
      SELECT c.relname AS table_name, p.polname AS policy_name, p.polcmd AS command,
        p.polpermissive AS permissive,
        ARRAY(
          SELECT CASE WHEN role_oid = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(role_oid) END
          FROM unnest(p.polroles) AS role_oid
          ORDER BY 1
        ) AS roles,
        pg_get_expr(p.polqual, p.polrelid) AS using_qualifier,
        pg_get_expr(p.polwithcheck, p.polrelid) AS check_qualifier
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname IN ('app', 'public')
        AND c.relname IN ('PermissionDefinition', 'OrgRoleDefinition', 'OrgRolePermission', 'OrgRoleRevision', 'UserRoleAssignment', 'AccessTagGrant', 'AuditEvent', 'OutboxEvent')
      ORDER BY c.relname, p.polname
    `),
    ]);
    const [unforcedTables, disabledTables, publicRoleGrants, requiredTables, policies] = queries;

    const { missing: missingRequiredTables, duplicate: duplicateRequiredTables } =
      findRequiredTableCopies(requiredTables, REQUIRED_RLS_TABLES);
    const unreviewedRolePolicies = findUnreviewedRolePolicies(policies);
    const disabledRequiredTables = findRequiredTableEntries(
      disabledTables,
      REQUIRED_RLS_TABLES,
    );
    const requiredPublicRoleGrants = findRequiredTableEntries(
      publicRoleGrants,
      REQUIRED_RLS_TABLES,
    );

    if (
      missingRequiredTables.length === 0 &&
      duplicateRequiredTables.length === 0 &&
      disabledTables.length === 0 &&
      unforcedTables.length === 0 &&
      unreviewedRolePolicies.length === 0 &&
      publicRoleGrants.length === 0
    ) {
      console.log(
        `[supabase-rls] required app/public tables have forced RLS; checked ${databaseSchema} tables have RLS enabled and no PUBLIC/anon/authenticated grants.`,
      );
      return;
    }

    if (missingRequiredTables.length > 0) {
      console.warn(
        `[supabase-rls] ${missingRequiredTables.length} required RLS tables are missing:`,
      );
      for (const tableName of missingRequiredTables) {
        console.warn(`[supabase-rls] - ${tableName}`);
      }
    }

    if (duplicateRequiredTables.length > 0) {
      console.warn(
        `[supabase-rls] ${duplicateRequiredTables.length} required RLS tables have multiple physical copies: ${duplicateRequiredTables.join(", ")}`,
      );
    }

    if (disabledTables.length > 0) {
      console.warn(
        `[supabase-rls] ${disabledTables.length} checked app/public tables have RLS disabled:`,
      );
      for (const table of disabledTables) {
        console.warn(
          `[supabase-rls] - ${table.schema_name}.${table.table_name}`,
        );
      }
    }

    if (unforcedTables.length > 0) {
      console.warn(`[supabase-rls] ${unforcedTables.length} required tables do not force RLS:`);
      for (const table of unforcedTables) {
        console.warn(`[supabase-rls] - ${table.schema_name}.${table.table_name}`);
      }
    }

    if (unreviewedRolePolicies.length > 0) {
      console.warn(
        `[supabase-rls] unreviewed required-table RLS policies: ${unreviewedRolePolicies.join(", ")}`,
      );
    }

    if (publicRoleGrants.length > 0) {
      console.warn(
        `[supabase-rls] ${publicRoleGrants.length} checked app/public table grants still expose PUBLIC, anon, or authenticated access:`,
      );
      for (const grant of publicRoleGrants) {
        console.warn(
          `[supabase-rls] - ${grant.schema_name}.${grant.table_name} -> ${grant.grantee} (${grant.privileges})`,
        );
      }
    }

    if (requiredPublicRoleGrants.length > 0) {
      console.warn(
        `[supabase-rls] ${requiredPublicRoleGrants.length} required-table grants must be removed before this gate can pass.`,
      );
    }

    if (
      accepted &&
      missingRequiredTables.length === 0 &&
      duplicateRequiredTables.length === 0 &&
      disabledRequiredTables.length === 0 &&
      unforcedTables.length === 0 &&
      unreviewedRolePolicies.length === 0 &&
      requiredPublicRoleGrants.length === 0
    ) {
      console.warn(
        "[supabase-rls] SUPABASE_RLS_GATE_ACCEPTED=true; continuing because public-table exposure was accepted while required role RLS remains enforced.",
      );
      return;
    }

    const message = [
      missingRequiredTables.length > 0
        ? "Required RLS tables are missing. Apply the current Prisma migrations before running the RLS gate."
        : undefined,
      duplicateRequiredTables.length > 0
        ? "Required RLS tables have multiple physical copies; reconcile the schema before running the RLS gate."
        : undefined,
      requiredPublicRoleGrants.length > 0
        ? "Required RLS tables cannot retain PUBLIC, anon, or authenticated grants, even with SUPABASE_RLS_GATE_ACCEPTED=true."
        : undefined,
      disabledTables.length > 0 || publicRoleGrants.length > 0
        ? "Supabase RLS gate failed. Enable RLS and remove PUBLIC, anon, or authenticated table grants, or remove the configured schema from Data API exposure before setting SUPABASE_RLS_GATE_ACCEPTED=true."
        : undefined,
      unforcedTables.length > 0 || unreviewedRolePolicies.length > 0
        ? "Required ACE access-control tables must force RLS and retain only their reviewed policies."
        : undefined,
    ]
      .filter(Boolean)
      .join(" ");
    if (strict) throw new Error(message);
    console.warn(`[supabase-rls] warning: ${message}`);
  } finally {
    await prisma.$disconnect();
  }
}

function firstPresent(...values) {
  return values.find((value) => isPresent(value));
}

function isTrue(value) {
  return ["1", "true", "yes"].includes(String(value ?? "").toLowerCase());
}

function resolveRlsEnvFile() {
  try {
    return resolveEnvFile();
  } catch (error) {
    if (isPresent(process.env.E2E_DATABASE_URL)) {
      return undefined;
    }
    throw error;
  }
}

function schemaFromDatabaseUrl(url) {
  const schema = new URL(url).searchParams.get("schema");
  if (schema !== "app" && schema !== "public") {
    throw new Error("The RLS gate requires a database URL with schema=app or schema=public.");
  }
  return schema;
}
