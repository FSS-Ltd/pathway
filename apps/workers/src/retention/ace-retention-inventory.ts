export type AceRetentionExportPolicy = {
  retention: "academic" | "communications" | "operational" | "safeguarding";
  export: "tenant-admin" | "restricted";
};

const academic = [
  "AcademicYear",
  "AcademicPeriod",
  "StudentSubjectEnrollment",
  "PaceAssessment",
  "PaceProgress",
  "PacePolicy",
  "PacePolicyOverride",
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
] as const;
const operational = [
  "GuardianIdentity",
  "StudentIdentity",
  "StudentIdentityLink",
  "GuardianChildRelationship",
  "FamilyIdentityInvite",
  "Trip",
  "TripCheckpoint",
  "TripCheckpointAttendance",
  "PermissionSlip",
  "PermissionSlipVersion",
  "PermissionSlipRecipient",
  "PermissionSlipResponse",
  "PermissionSlipException",
  "PermissionSlipReminder",
  "BehaviourEntry",
  "DemeritPolicy",
  "DemeritStageOverride",
  "StudentPortalPolicy",
] as const;
const communications = [
  "AceCommunityPolicy",
  "AceCommunityGroup",
  "AceCommunityGroupChildMember",
  "AceCommunityGroupStaffMember",
  "AceCommunityPost",
  "AceCommunityReply",
  "AceCommunityReadCursor",
  "AceCommunityReport",
  "AceCommunityModerationAction",
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
] as const;
const safeguarding = ["AceCommunitySafeguardingReference"] as const;

export const ACE_RETENTION_EXPORT_INVENTORY: Readonly<
  Record<string, AceRetentionExportPolicy>
> = Object.freeze({
  ...policiesFor(academic, { retention: "academic", export: "tenant-admin" }),
  ...policiesFor(operational, {
    retention: "operational",
    export: "tenant-admin",
  }),
  ...policiesFor(communications, {
    retention: "communications",
    export: "tenant-admin",
  }),
  ...policiesFor(safeguarding, {
    retention: "safeguarding",
    export: "restricted",
  }),
});

export function getAceRetentionExportPolicy(
  model: string,
): AceRetentionExportPolicy | undefined {
  return ACE_RETENTION_EXPORT_INVENTORY[model];
}

function policiesFor(
  models: readonly string[],
  policy: AceRetentionExportPolicy,
): Record<string, AceRetentionExportPolicy> {
  return Object.fromEntries(models.map((model) => [model, policy]));
}
