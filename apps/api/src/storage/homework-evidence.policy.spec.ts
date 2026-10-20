import { createHash } from "node:crypto";
import {
  MAX_HOMEWORK_EVIDENCE_BYTES,
  validateEvidenceIntent,
  verifyEvidenceBytes,
} from "./homework-evidence.policy";

describe("homework evidence policy", () => {
  const body = Buffer.from("%PDF-1.7\nexample");
  const valid = {
    fileName: "work.pdf",
    mimeType: "application/pdf" as const,
    byteLength: body.length,
    sha256: createHash("sha256").update(body).digest("hex"),
  };

  it("accepts matching bounded bytes", () => {
    validateEvidenceIntent(valid);
    verifyEvidenceBytes(body, valid);
  });

  it.each(["../secret.pdf", "folder\\work.pdf", "bad\nname.pdf", ".."])(
    "rejects unsafe file name %s",
    (fileName) => {
      expect(() => validateEvidenceIntent({ ...valid, fileName })).toThrow();
    },
  );

  it("rejects unsupported or oversized uploads", () => {
    expect(() =>
      validateEvidenceIntent({ ...valid, mimeType: "text/html" }),
    ).toThrow();
    expect(() =>
      validateEvidenceIntent({
        ...valid,
        byteLength: MAX_HOMEWORK_EVIDENCE_BYTES + 1,
      }),
    ).toThrow();
  });

  it("rejects a mismatched signature or checksum", () => {
    expect(() =>
      verifyEvidenceBytes(Buffer.from("not a PDF"), valid),
    ).toThrow();
    expect(() =>
      verifyEvidenceBytes(body, { ...valid, sha256: "0".repeat(64) }),
    ).toThrow();
  });
});
