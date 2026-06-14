import { Injectable, Logger } from "@nestjs/common";

export type StorageUploadInput = {
  bucket: "private" | "public";
  key: string;
  body: Buffer;
  contentType: string;
};

export type StorageObject = {
  bucket: string;
  key: string;
};

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
    if (!this.isConfigured()) return null;

    const bucket = this.resolveBucket(input.bucket);
    const response = await fetch(this.objectUrl(bucket, input.key), {
      method: "POST",
      headers: {
        ...this.authHeaders(),
        "Content-Type": input.contentType,
        "x-upsert": "true",
      },
      body: new Uint8Array(input.body),
    });

    if (!response.ok) {
      const message = await this.safeResponseText(response);
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

  async downloadObject(bucket: string, key: string): Promise<Buffer | null> {
    if (!this.isConfigured()) return null;

    const response = await fetch(this.objectUrl(bucket, key), {
      method: "GET",
      headers: this.authHeaders(),
    });

    if (response.status === 404) return null;
    if (!response.ok) {
      const message = await this.safeResponseText(response);
      this.logger.error({
        message: "Supabase Storage download failed",
        status: response.status,
        bucket,
        key,
        response: message,
      });
      throw new Error("Supabase Storage download failed");
    }

    return Buffer.from(await response.arrayBuffer());
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

function encodeStorageKey(key: string): string {
  return key.split("/").map(encodePath).join("/");
}

function encodePath(value: string): string {
  return encodeURIComponent(value);
}
