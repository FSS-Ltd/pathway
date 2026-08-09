import {
  ACE_RETENTION_EXPORT_INVENTORY,
  getAceRetentionExportPolicy,
} from "../ace-retention-inventory";

describe("ACE retention and export inventory", () => {
  it("classifies every ACE foundation table for retention and export", () => {
    expect(Object.keys(ACE_RETENTION_EXPORT_INVENTORY)).toHaveLength(57);
    expect(getAceRetentionExportPolicy("Message")).toEqual({
      retention: "communications",
      export: "tenant-admin",
    });
    expect(
      getAceRetentionExportPolicy("AceCommunitySafeguardingReference"),
    ).toEqual({
      retention: "safeguarding",
      export: "restricted",
    });
  });
});
