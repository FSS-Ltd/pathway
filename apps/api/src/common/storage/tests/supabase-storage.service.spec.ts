import {
  StorageObjectTooLargeError,
  SupabaseStorageService,
} from "../supabase-storage.service";
import {
  financeDocumentStorageKey,
  financeStatementStorageKey,
  homeworkEvidenceKey,
  isPrivateStorageKey,
} from "../storage-key.util";

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

  it("rejects a private-bucket key outside the registered namespaces", async () => {
    const service = new SupabaseStorageService();
    await expect(
      service.uploadObject({
        bucket: "private",
        key: "unscoped/secret.pdf",
        body: Buffer.from("secret"),
        contentType: "application/pdf",
      }),
    ).rejects.toThrow("Private storage key is not allow-listed");
  });
});

describe("private homework evidence storage", () => {
  const originalEnv = { ...process.env };
  const tenantId = "tenant_1";
  const recipientId = "04b7d8c4-c891-4af8-9011-d5a403ce3296";
  const evidenceId = "8b4c7f2a-85ed-4886-9cc5-79d79d9e9387";
  const uploadKey = homeworkEvidenceKey(
    tenantId,
    recipientId,
    evidenceId,
    "application/pdf",
    "upload",
  );

  beforeEach(() => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-secret";
    process.env.SUPABASE_STORAGE_PRIVATE_BUCKET = "private-bucket";
    process.env.SUPABASE_STORAGE_PUBLIC_BUCKET = "public-bucket";
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it("signs only allow-listed temporary homework keys", async () => {
    const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        url: `/object/upload/sign/private-bucket/${uploadKey}?token=signed-token`,
      }),
    );
    const service = new SupabaseStorageService();
    expect(await service.createSignedUploadUrl(uploadKey)).toBe(
      `https://project.supabase.co/storage/v1/object/upload/sign/private-bucket/${uploadKey}?token=signed-token`,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `https://project.supabase.co/storage/v1/object/upload/sign/private-bucket/${uploadKey}`,
      expect.objectContaining({ method: "POST" }),
    );
    await expect(
      service.createSignedUploadUrl("unscoped/file.pdf"),
    ).rejects.toThrow();
    expect(
      isPrivateStorageKey(
        homeworkEvidenceKey(
          tenantId,
          recipientId,
          evidenceId,
          "application/pdf",
          "clean",
        ),
      ),
    ).toBe(true);
  });

  it("stops reading an uploaded object beyond its byte limit", async () => {
    jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(Buffer.from("too many bytes"), { status: 200 }),
      );
    const service = new SupabaseStorageService();
    await expect(
      service.downloadObject("private-bucket", uploadKey, 4),
    ).rejects.toBeInstanceOf(StorageObjectTooLargeError);
  });
});

describe("Finance private document keys", () => {
  const tenantId = "tenant_1";
  const documentId = "04b7d8c4-c891-4af8-9011-d5a403ce3296";

  it("allow-lists private statement, invoice, credit, and receipt documents", () => {
    expect(
      isPrivateStorageKey(
        financeStatementStorageKey(tenantId, documentId, "a".repeat(64)),
      ),
    ).toBe(true);
    for (const kind of ["invoice", "credit-note", "receipt"] as const) {
      expect(
        isPrivateStorageKey(
          financeDocumentStorageKey(tenantId, kind, documentId),
        ),
      ).toBe(true);
    }
  });

  it("rejects unscoped or unexpected Finance document paths", () => {
    expect(
      isPrivateStorageKey(
        `tenants/${tenantId}/finance-documents/${documentId}/invoice.csv`,
      ),
    ).toBe(false);
    expect(
      isPrivateStorageKey(`finance-statements/${documentId}/statement.pdf`),
    ).toBe(false);
    expect(
      isPrivateStorageKey(
        `tenants/${tenantId}/finance-statements/${documentId}/not-a-digest.pdf`,
      ),
    ).toBe(false);
  });
});
