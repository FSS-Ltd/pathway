import { SupabaseStorageService } from "../supabase-storage.service";

describe("SupabaseStorageService.getPublicUrl", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("builds a public storage URL for the configured public bucket", () => {
    process.env.SUPABASE_URL = "https://project.supabase.co/";
    process.env.SUPABASE_SECRET_KEY = "secret";
    process.env.SUPABASE_STORAGE_PRIVATE_BUCKET = "private-bucket";
    process.env.SUPABASE_STORAGE_PUBLIC_BUCKET = "public-bucket";

    const service = new SupabaseStorageService();
    const url = service.getPublicUrl("orgs/org_1/logo.png");

    expect(url).toBe(
      "https://project.supabase.co/storage/v1/object/public/public-bucket/orgs/org_1/logo.png",
    );
  });

  it("throws when the public bucket is not configured", () => {
    delete process.env.SUPABASE_STORAGE_PUBLIC_BUCKET;
    process.env.SUPABASE_URL = "https://project.supabase.co";

    const service = new SupabaseStorageService();
    expect(() => service.getPublicUrl("orgs/org_1/logo.png")).toThrow(
      "Missing Supabase public storage bucket",
    );
  });
});
