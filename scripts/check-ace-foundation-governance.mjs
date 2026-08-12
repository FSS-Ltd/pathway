#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const schema = readFileSync(
  resolve(root, "packages/db/prisma/schema.prisma"),
  "utf8",
);
const rlsGate = readFileSync(
  resolve(root, "scripts/check-supabase-rls.mjs"),
  "utf8",
);
const migration = readFileSync(
  resolve(
    root,
    "packages/db/prisma/migrations/20260809210000_ace_foundation_preflight/migration.sql",
  ),
  "utf8",
);
const governance = JSON.parse(
  readFileSync(
    process.env.ACE_GOVERNANCE_FILE ??
      resolve(root, "packages/db/ace-foundation-governance.json"),
    "utf8",
  ),
);
const storage = readFileSync(
  resolve(root, "apps/api/src/common/storage/storage-key.util.ts"),
  "utf8",
);

const requiredTables = [
  "AcademicYear",
  "AcademicPeriod",
  "StudentSubjectEnrollment",
  "PaceAssessment",
  "PaceProgress",
  "PacePolicy",
  "PacePolicyOverride",
  "BehaviourCategory",
  "BehaviourEntry",
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
];

const governanceByTable = new Map(
  governance.groups.flatMap((group) =>
    group.tables.map((table) => [table, group.controls]),
  ),
);
const requiredControls = [
  "retention",
  "export",
  "auditEntity",
  "outbox",
  "storage",
];
const missing = requiredTables.filter((name) => {
  const controls = governanceByTable.get(name);
  return (
    !schema.includes(`model ${name} `) ||
    !rlsGate.includes(`"${name}"`) ||
    !controls ||
    requiredControls.some((control) => !controls[control])
  );
});
const unexpected = [...governanceByTable.keys()].filter(
  (name) => !requiredTables.includes(name),
);
if (missing.length)
  throw new Error(`ACE governance inventory incomplete: ${missing.join(", ")}`);
if (unexpected.length)
  throw new Error(
    `ACE governance inventory contains unknown tables: ${unexpected.join(", ")}`,
  );
for (const token of [
  "OutboxStatus",
  "nextAttemptAt",
  "DEAD_LETTER",
  "DISPATCHED",
  "RETENTION_PURGED",
]) {
  if (!schema.includes(token) || !migration.includes(token))
    throw new Error(`ACE governance is missing ${token}`);
}
for (const functionName of [
  "messageAttachmentKey",
  "noticeAttachmentKey",
  "isPrivateStorageKey",
]) {
  if (!storage.includes(`function ${functionName}`))
    throw new Error(`ACE private storage class is missing ${functionName}`);
}
console.log(
  `[ace-governance] ${requiredTables.length} tables have explicit RLS, retention, export, audit, storage, and outbox classifications.`,
);
