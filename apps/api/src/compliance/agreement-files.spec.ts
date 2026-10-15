import {
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import {
  AgreementFiles,
  decodeAgreementPdf,
  MAX_AGREEMENT_FILE_BYTES,
} from "./agreement-files";
import { SupabaseStorageService } from "../common/storage/supabase-storage.service";
import { isPrivateStorageKey } from "../common/storage/storage-key.util";
import {
  agreementAssignInput,
  agreementSignedInput,
  agreementVersionInput,
} from "./agreements.dto";
const pdf = {
  fileName: "terms.pdf",
  base64: Buffer.from("%PDF-1.7\nexample").toString("base64"),
};
describe("Agreement PDF and input boundaries", () => {
  it("accepts canonical PDF bytes and rejects malformed, noncanonical, disguised or oversized input", () => {
    expect(decodeAgreementPdf(pdf).subarray(0, 5).toString()).toBe("%PDF-");
    const largest = Buffer.alloc(MAX_AGREEMENT_FILE_BYTES);
    largest.write("%PDF-");
    expect(
      decodeAgreementPdf({ ...pdf, base64: largest.toString("base64") }).length,
    ).toBe(MAX_AGREEMENT_FILE_BYTES);
    for (const base64 of [
      pdf.base64 + "\n",
      "!!!!",
      "pdDExq0=",
      Buffer.from("<html>unsafe</html>").toString("base64"),
      Buffer.alloc(MAX_AGREEMENT_FILE_BYTES + 1).toString("base64"),
      "JVBERi1=",
    ]) {
      expect(() => decodeAgreementPdf({ ...pdf, base64 })).toThrow(
        BadRequestException,
      );
    }
  });
  it("requires affirmative adult confirmation, unique recipients, strict fields and a real signing date", () => {
    expect(
      agreementAssignInput.safeParse({
        recipientUserIds: ["00000000-0000-4000-8000-000000000001"],
        adultsConfirmed: false,
      }).success,
    ).toBe(false);
    expect(
      agreementAssignInput.safeParse({
        recipientUserIds: [
          "00000000-0000-4000-8000-000000000001",
          "00000000-0000-4000-8000-000000000001",
        ],
        adultsConfirmed: true,
      }).success,
    ).toBe(false);
    expect(
      agreementVersionInput.safeParse({
        title: "Terms",
        contentText: "Body",
        originalPdf: null,
        tenantId: "injected",
      }).success,
    ).toBe(false);
    expect(
      agreementSignedInput.safeParse({
        versionId: "00000000-0000-4000-8000-000000000001",
        typedName: "A",
        signedOn: "2026-02-30",
        pdf,
      }).success,
    ).toBe(false);
    expect(
      agreementVersionInput.safeParse({
        title: "Terms",
        contentText: "Body",
        originalPdf: { ...pdf, fileName: "../bad.pdf" },
      }).success,
    ).toBe(false);
  });
  it("uses random allow-listed private keys, refuses unavailable uploads and verifies download hashes", async () => {
    const storage = new SupabaseStorageService();
    const upload = jest
      .spyOn(storage, "uploadObject")
      .mockResolvedValue({ bucket: "private", key: "ignored" });
    const download = jest
      .spyOn(storage, "downloadObject")
      .mockResolvedValue(Buffer.from("%PDF-1.7\nexample"));
    const service = new AgreementFiles(storage);
    const first = await service.upload(
      "00000000-0000-4000-8000-000000000001",
      pdf,
    );
    const second = await service.upload(
      "00000000-0000-4000-8000-000000000001",
      pdf,
    );
    expect(first.key).not.toBe(second.key);
    expect(isPrivateStorageKey(first.key)).toBe(true);
    expect(upload.mock.calls[0][0].bucket).toBe("private");
    const previous = process.env.SUPABASE_STORAGE_PRIVATE_BUCKET;
    process.env.SUPABASE_STORAGE_PRIVATE_BUCKET = "agreement-private";
    try {
      expect((await service.download(first)).bytes.toString()).toBe(
        "%PDF-1.7\nexample",
      );
      download.mockResolvedValue(Buffer.from("altered"));
      await expect(service.download(first)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      upload.mockResolvedValue(null);
      await expect(service.upload("site", pdf)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(first.sha256).toBe(
        createHash("sha256")
          .update(Buffer.from(pdf.base64, "base64"))
          .digest("hex"),
      );
    } finally {
      if (previous === undefined)
        delete process.env.SUPABASE_STORAGE_PRIVATE_BUCKET;
      else process.env.SUPABASE_STORAGE_PRIVATE_BUCKET = previous;
    }
  });
});
