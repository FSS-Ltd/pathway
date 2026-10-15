import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import type { AgreementPdfInput } from "@pathway/types";
import { SupabaseStorageService } from "../common/storage/supabase-storage.service";
import {
  decodeAgreementPdf,
  MAX_AGREEMENT_FILE_BYTES,
  type StoredAgreementFile,
} from "./agreement-files";
@Injectable()
export class TrackerFiles {
  constructor(
    @Inject(SupabaseStorageService)
    private readonly storage: SupabaseStorageService,
  ) {}
  async upload(
    tenantId: string,
    input: AgreementPdfInput,
  ): Promise<StoredAgreementFile> {
    const body = decodeAgreementPdf(input);
    const key = `tenants/${tenantId}/compliance-evidence/${randomUUID()}/document.pdf`;
    try {
      const result = await this.storage.uploadObject({
        bucket: "private",
        key,
        body,
        contentType: "application/pdf",
      });
      if (!result) throw new Error("Storage unavailable");
      return {
        key,
        fileName: input.fileName,
        sha256: createHash("sha256").update(body).digest("hex"),
      };
    } catch {
      throw new ServiceUnavailableException(
        "Evidence storage is unavailable. Please retry.",
      );
    }
  }
  async download(
    file: StoredAgreementFile,
  ): Promise<{ bytes: Buffer; fileName: string }> {
    try {
      const bucket = process.env.SUPABASE_STORAGE_PRIVATE_BUCKET?.trim();
      if (!bucket) throw new Error("Storage unavailable");
      const bytes = await this.storage.downloadObject(bucket, file.key);
      if (
        !bytes ||
        bytes.length > MAX_AGREEMENT_FILE_BYTES ||
        createHash("sha256").update(bytes).digest("hex") !== file.sha256
      )
        throw new Error("Evidence integrity failed");
      return { bytes, fileName: file.fileName };
    } catch {
      throw new ServiceUnavailableException(
        "Evidence could not be verified or retrieved. Please retry.",
      );
    }
  }
}
