import governance from "../../../../packages/db/ace-foundation-governance.json";

export type AceRetentionExportPolicy = {
  retention: "academic" | "communications" | "operational" | "safeguarding";
  export: "tenant-admin" | "restricted";
  auditEntity:
    | "ACE_COMMUNITY_CONTENT"
    | "ACE_MESSAGE"
    | "ACE_NOTICE"
    | "ACE_RECORD";
  outbox: "NOT_APPLICABLE";
  storage: "MESSAGE_ATTACHMENT" | "NONE" | "NOTICE_ATTACHMENT";
};

export const ACE_RETENTION_EXPORT_INVENTORY: Readonly<
  Record<string, AceRetentionExportPolicy>
> = Object.freeze(
  Object.fromEntries(
    governance.groups.flatMap(({ tables, controls }) =>
      tables.map((table) => [table, controls]),
    ),
  ) as Record<string, AceRetentionExportPolicy>,
);

export function getAceRetentionExportPolicy(
  model: string,
): AceRetentionExportPolicy | undefined {
  return ACE_RETENTION_EXPORT_INVENTORY[model];
}
