export interface ReportBundleStorage {
  uploadCsv(key: string, contents: string): Promise<void>;
}

export class SupabaseReportBundleStorage implements ReportBundleStorage {
  async uploadCsv(key: string, contents: string): Promise<void> {
    const baseUrl = process.env.SUPABASE_URL?.trim().replace(/\/$/, "");
    const bucket = process.env.SUPABASE_STORAGE_PRIVATE_BUCKET?.trim();
    const secret = process.env.SUPABASE_SECRET_KEY?.trim();
    if (!baseUrl || !bucket || !secret) {
      throw new Error("Supabase storage is not configured");
    }

    const response = await fetch(
      `${baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${key
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`,
      {
        method: "POST",
        headers: {
          apikey: secret,
          Authorization: `Bearer ${secret}`,
          "Content-Type": "text/csv",
          "x-upsert": "true",
        },
        body: contents,
      },
    );
    if (!response.ok) {
      throw new Error("Report bundle storage upload failed");
    }
  }
}
