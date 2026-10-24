import { Injectable, Logger } from "@nestjs/common";
import { isPrivateStorageKey } from "./storage-key.util";

export type StorageUploadInput = {
  bucket: "private" | "public";
  key: string;
  body: Buffer;
  contentType: string;
  /** False creates once and reuses an existing object identity on conflict. */
  overwrite?: boolean;
};

export type StorageObject = {
  bucket: string;
  key: string;
};

export class StorageObjectTooLargeError extends Error {}

@Injectable()
export class SupabaseStorageService {
  private readonly logger = new Logger(SupabaseStorageService.name);

  isConfigured(): boolean {
    return Boolean(
      process.env.SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SECRET_KEY?.trim() &&
      process.env.SUPABASE_STORAGE_PRIVATE_BUCKET?.trim() &&
      process.env.SUPABASE_STORAGE_PUBLIC_BUCKET?.trim(),
    );
  }

  async uploadObject(input: StorageUploadInput): Promise<StorageObject | null> {
    this.assertPrivateStorageKey(input.bucket, input.key);
    if (!this.isConfigured()) return null;

    const bucket = this.resolveBucket(input.bucket);
    const response = await fetch(this.objectUrl(bucket, input.key), {
      method: "POST",
      headers: {
        ...this.authHeaders(),
        "Content-Type": input.contentType,
        "x-upsert": String(input.overwrite ?? true),
      },
      body: new Uint8Array(input.body),
    });

    if (!response.ok) {
      const message = await this.safeResponseText(response);
      if (
        input.overwrite === false &&
        isExistingObjectResponse(response.status, message)
      ) {
        return { bucket, key: input.key };
      }
      this.logger.error({
        message: "Supabase Storage upload failed",
        status: response.status,
        bucket,
        key: input.key,
        response: message,
      });
      throw new Error("Supabase Storage upload failed");
    }

    return { bucket, key: input.key };
  }

  async createSignedUploadUrl(key: string): Promise<string | null> {
    this.assertPrivateStorageKey("private", key);
    if (!this.isConfigured()) return null;
    const bucket = this.resolveBucket("private");
    const baseUrl = process.env.SUPABASE_URL?.trim().replace(/\/$/, "");
    if (!baseUrl) return null;
    const response = await fetch(
      `${baseUrl}/storage/v1/object/upload/sign/${encodePath(bucket)}/${encodeStorageKey(key)}`,
      {
        method: "POST",
        headers: { ...this.authHeaders(), "Content-Type": "application/json" },
        body: "{}",
      },
    );
    if (!response.ok) {
      this.logger.error({
        message: "Supabase signed upload request failed",
        status: response.status,
      });
      throw new Error("Supabase signed upload request failed");
    }
    const payload: unknown = await response.json();
    const relativeUrl =
      typeof payload === "object" && payload !== null && "url" in payload
        ? payload.url
        : null;
    if (
      typeof relativeUrl !== "string" ||
      !relativeUrl.startsWith("/object/upload/sign/")
    ) {
      throw new Error("Supabase signed upload response was invalid");
    }
    return `${baseUrl}/storage/v1${relativeUrl}`;
  }

  async downloadObject(
    bucket: string,
    key: string,
    maxBytes = Number.POSITIVE_INFINITY,
  ): Promise<Buffer | null> {
    if (bucket === process.env.SUPABASE_STORAGE_PRIVATE_BUCKET?.trim()) {
      this.assertPrivateStorageKey("private", key);
    }
    if (!this.isConfigured()) return null;

    const response = await fetch(this.objectUrl(bucket, key), {
      method: "GET",
      headers: this.authHeaders(),
    });

    if (response.status === 404) return null;
    if (!response.ok) {
      const message = await this.safeResponseText(response);
      if (isMissingObjectResponse(response.status, message)) return null;
      this.logger.error({
        message: "Supabase Storage download failed",
        status: response.status,
        bucket,
        key,
        response: message,
      });
      throw new Error("Supabase Storage download failed");
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("Supabase Storage response was empty");
    const chunks: Buffer[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          throw new StorageObjectTooLargeError(
            "Supabase Storage object exceeded the permitted size",
          );
        }
        chunks.push(Buffer.from(value));
      }
    } finally {
      reader.releaseLock();
    }
    return Buffer.concat(chunks, total);
  }

  privateBucketName(): string | null {
    return process.env.SUPABASE_STORAGE_PRIVATE_BUCKET?.trim() || null;
  }

  /**
   * Builds a public, unauthenticated URL for an object in the public bucket
   * (e.g. an org logo rendered directly in an <img> tag). Does not verify the
   * object exists — callers should have already uploaded it.
   */
  getPublicUrl(key: string): string {
    const bucket = this.resolveBucket("public");
    const baseUrl = process.env.SUPABASE_URL?.trim().replace(/\/$/, "");
    if (!baseUrl) throw new Error("Missing SUPABASE_URL");
    return `${baseUrl}/storage/v1/object/public/${encodePath(bucket)}/${encodeStorageKey(key)}`;
  }

  private resolveBucket(kind: StorageUploadInput["bucket"]): string {
    const bucket =
      kind === "private"
        ? process.env.SUPABASE_STORAGE_PRIVATE_BUCKET
        : process.env.SUPABASE_STORAGE_PUBLIC_BUCKET;
    if (!bucket?.trim()) {
      throw new Error(`Missing Supabase ${kind} storage bucket`);
    }
    return bucket.trim();
  }

  private assertPrivateStorageKey(
    bucket: StorageUploadInput["bucket"],
    key: string,
  ): void {
    if (bucket === "private" && !isPrivateStorageKey(key)) {
      throw new Error("Private storage key is not allow-listed");
    }
  }

  private objectUrl(bucket: string, key: string): string {
    const baseUrl = process.env.SUPABASE_URL?.trim().replace(/\/$/, "");
    if (!baseUrl) throw new Error("Missing SUPABASE_URL");
    return `${baseUrl}/storage/v1/object/${encodePath(bucket)}/${encodeStorageKey(key)}`;
  }

  private authHeaders(): Record<string, string> {
    const key = process.env.SUPABASE_SECRET_KEY?.trim();
    if (!key) throw new Error("Missing SUPABASE_SECRET_KEY");
    return {
      apikey: key,
      Authorization: `Bearer ${key}`,
    };
  }

  private async safeResponseText(response: Response): Promise<string> {
    const text = await response.text().catch(() => "");
    return text.slice(0, 500);
  }
}

function isExistingObjectResponse(status: number, body: string): boolean {
  if (status !== 400 && status !== 409) return false;
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }
  if (typeof payload !== "object" || payload === null) return false;
  const code = "code" in payload ? payload.code : null;
  const error = "error" in payload ? payload.error : null;
  return (
    code === "ResourceAlreadyExists" ||
    code === "KeyAlreadyExists" ||
    code === "already_exists" ||
    error === "Duplicate"
  );
}

/** Some Storage API versions report a missing object as HTTP 400 with a 404 body. */
function isMissingObjectResponse(status: number, body: string): boolean {
  if (status !== 400) return false;
  try {
    const payload: unknown = JSON.parse(body);
    return (
      typeof payload === "object" &&
      payload !== null &&
      "statusCode" in payload &&
      String(payload.statusCode) === "404"
    );
  } catch {
    return false;
  }
}

function encodeStorageKey(key: string): string {
  return key.split("/").map(encodePath).join("/");
}

function encodePath(value: string): string {
  return encodeURIComponent(value);
}
