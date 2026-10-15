import {
  BadRequestException,
  Injectable,
  Inject,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import type { AgreementPdfInput } from "@pathway/types";
import { SupabaseStorageService } from "../common/storage/supabase-storage.service";

export const MAX_AGREEMENT_FILE_BYTES = 2 * 1024 * 1024;
export function decodeAgreementPdf(input: AgreementPdfInput): Buffer {
  if (
    input.base64.length > Math.ceil(MAX_AGREEMENT_FILE_BYTES / 3) * 4 ||
    /[^A-Za-z0-9+/=]/.test(input.base64) ||
    input.base64.length % 4 !== 0
  )
    throw new BadRequestException("Supply a PDF encoded as canonical base64");
  const bytes = Buffer.from(input.base64, "base64");
  if (
    bytes.toString("base64") !== input.base64 ||
    bytes.length > MAX_AGREEMENT_FILE_BYTES ||
    !bytes.subarray(0, 5).equals(Buffer.from("%PDF-", "ascii"))
  )
    throw new BadRequestException("Supply a PDF no larger than 2 MiB");
  return bytes;
}
export interface StoredAgreementFile {
  key: string;
  fileName: string;
  sha256: string;
}
@Injectable()
export class AgreementFiles {
  constructor(
    @Inject(SupabaseStorageService)
    private readonly storage: SupabaseStorageService,
  ) {}
  async upload(
    tenantId: string,
    input: AgreementPdfInput,
  ): Promise<StoredAgreementFile> {
    const body = decodeAgreementPdf(input);
    const key = `tenants/${tenantId}/agreements/${randomUUID()}/document.pdf`;
    try {
      const object = await this.storage.uploadObject({
        bucket: "private",
        key,
        body,
        contentType: "application/pdf",
      });
      if (!object) throw new Error("Storage unavailable");
      return {
        key,
        fileName: input.fileName,
        sha256: createHash("sha256").update(body).digest("hex"),
      };
    } catch {
      throw new ServiceUnavailableException(
        "Agreement file storage is unavailable. Please retry.",
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
        throw new Error("File unavailable or integrity check failed");
      return { bytes, fileName: file.fileName };
    } catch {
      throw new ServiceUnavailableException(
        "Agreement file could not be verified or retrieved. Please retry.",
      );
    }
  }
}
