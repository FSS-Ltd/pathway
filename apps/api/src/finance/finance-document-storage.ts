import { ServiceUnavailableException } from "@nestjs/common";
import type { SupabaseStorageService } from "../common/storage/supabase-storage.service";

/** Read the first stored PDF, including when another request wins its creation. */
export async function loadOrCreateFinanceDocument(
  storage: Pick<
    SupabaseStorageService,
    "privateBucketName" | "downloadObject" | "uploadObject"
  >,
  key: string,
  render: () => Promise<Buffer>,
): Promise<Buffer> {
  try {
    const bucket = storage.privateBucketName();
    if (!bucket) throw new Error("Private Finance bucket is not configured");
    const existing = await storage.downloadObject(bucket, key);
    if (existing) return existing;
    const bytes = await render();
    const stored = await storage.uploadObject({
      bucket: "private",
      key,
      body: bytes,
      contentType: "application/pdf",
      overwrite: false,
    });
    if (!stored) throw new Error("Finance document was not stored");
    // A concurrent writer may have committed different render bytes. Return the
    // canonical object, never this request's uncommitted local rendering.
    const canonical = await storage.downloadObject(bucket, key);
    if (!canonical) throw new Error("Stored Finance document is unavailable");
    return canonical;
  } catch (cause) {
    throw new ServiceUnavailableException(
      "Finance document storage is unavailable",
      { cause },
    );
  }
}
