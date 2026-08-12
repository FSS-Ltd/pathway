import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import {
  ACE_RETENTION_EXPORT_INVENTORY,
  getAceRetentionExportPolicy,
} from "../ace-retention-inventory";

const repositoryRoot = resolve(__dirname, "../../../../..");

describe("ACE retention and export inventory", () => {
  it("keeps the retention inventory in ACE governance schema parity", () => {
    expect(Object.keys(ACE_RETENTION_EXPORT_INVENTORY)).toEqual(
      expect.arrayContaining(["BehaviourCategory"]),
    );
    expect(() =>
      execFileSync(process.execPath, ["scripts/check-ace-foundation-governance.mjs"], {
        cwd: repositoryRoot,
        stdio: "pipe",
      }),
    ).not.toThrow();
  });

  it("classifies BehaviourCategory as an operational ACE record", () => {
    expect(getAceRetentionExportPolicy("BehaviourCategory")).toEqual({
      retention: "operational",
      export: "tenant-admin",
      auditEntity: "ACE_RECORD",
      outbox: "NOT_APPLICABLE",
      storage: "NONE",
    });
  });

  it("retains the existing communications and safeguarding classifications", () => {
    expect(getAceRetentionExportPolicy("Message")).toEqual({
      retention: "communications",
      export: "tenant-admin",
      auditEntity: "ACE_MESSAGE",
      outbox: "NOT_APPLICABLE",
      storage: "NONE",
    });
    expect(
      getAceRetentionExportPolicy("AceCommunitySafeguardingReference"),
    ).toEqual({
      retention: "safeguarding",
      export: "restricted",
      auditEntity: "ACE_COMMUNITY_CONTENT",
      outbox: "NOT_APPLICABLE",
      storage: "NONE",
    });
  });
});
