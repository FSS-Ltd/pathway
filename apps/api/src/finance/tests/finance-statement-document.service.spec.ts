import { createHash } from "node:crypto";
import { ForbiddenException } from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import type { FinanceAccessService } from "../access/finance-access.service";
import type { OutboxService } from "../../common/outbox/outbox.service";
import type { SupabaseStorageService } from "../../common/storage/supabase-storage.service";
import type { FinanceStatementSnapshot } from "../finance-statement-snapshot-schema";
import type { FinanceStatementRecord } from "../finance-statement-records";
import { FinanceStatementDocumentService } from "../finance-statement-document.service";

jest.mock("@pathway/db", () => ({ withTenantRlsContext: jest.fn() }));

const actor = { tenantId: "tenant-a", orgId: "org-a", userId: null };
const payerActor = { ...actor, userId: "payer-a" };
const statementId = "b4817e84-8cae-4277-aa92-9f840d672108";
const payerAccountId = "397d71dd-0284-47a2-b13a-b9d3b2ad47c2";
const generatedAt = "2026-09-30T23:00:00.000Z";

const snapshot: FinanceStatementSnapshot = {
  version: 1,
  currency: "GBP",
  payerName: "Family account",
  legalEntityName: "Example School",
  periodStart: "2026-09-01T00:00:00.000Z",
  periodEnd: "2026-10-01T00:00:00.000Z",
  generatedAt,
  ledgerCutoffAt: generatedAt,
  totals: {
    openingBalanceMinor: "0",
    chargesIssuedMinor: "12000",
    creditsIssuedMinor: "0",
    allocatedReceiptsMinor: "0",
    reversalsMinor: "0",
    closingBalanceMinor: "12000",
    unappliedFundsMinor: "0",
    processingFundsMinor: "0",
    uncoveredOutflowsMinor: "0",
  },
  lines: [],
};

function statement(
  status: "GENERATING" | "READY",
  document: { key: string; digest: string; size: number } | null = null,
): FinanceStatementRecord {
  const row = {
    id: statementId,
    financeProfileId: "profile-a",
    payerAccountId,
    tenantId: actor.tenantId,
    orgId: actor.orgId,
    kind: "ON_DEMAND" as const,
    status,
    periodStart: new Date(snapshot.periodStart),
    periodEnd: new Date(snapshot.periodEnd),
    generatedAt: new Date(generatedAt),
    ledgerCutoffAt: new Date(generatedAt),
    projectionVersion: 1,
    currency: "GBP" as const,
    openingBalanceMinor: 0n,
    chargesIssuedMinor: 12000n,
    creditsIssuedMinor: 0n,
    allocatedReceiptsMinor: 0n,
    reversalsMinor: 0n,
    closingBalanceMinor: 12000n,
    unappliedFundsMinor: 0n,
    processingFundsMinor: 0n,
    snapshot,
    idempotencyKey: "ON_DEMAND:request",
    requestHash: "a".repeat(64),
    documentStorageKey: document?.key ?? null,
    documentSha256: document?.digest ?? null,
    documentSizeBytes: document?.size ?? null,
    readyAt: status === "READY" ? new Date(generatedAt) : null,
    requestedByUserId: "payer-a",
    createdAt: new Date(generatedAt),
  };
  return row;
}

function setup(rows: FinanceStatementRecord[]) {
  const tx = {
    financeStatement: {
      findFirst: jest.fn().mockImplementation(async () => rows.shift() ?? null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    financePayerGrant: { findMany: jest.fn().mockResolvedValue([]) },
  };
  jest
    .mocked(withTenantRlsContext)
    .mockImplementation(async (_tenant, _org, callback) =>
      callback(tx as never),
    );

  const access = {
    assertStaffAction: jest.fn().mockResolvedValue(undefined),
    assertPayerAction: jest.fn().mockResolvedValue(undefined),
  };
  const storage = {
    uploadObject: jest.fn().mockResolvedValue({ key: "stored" }),
    downloadObject: jest.fn().mockResolvedValue(Buffer.from("pdf")),
  };
  const outbox = { enqueue: jest.fn().mockResolvedValue(undefined) };
  const service = new FinanceStatementDocumentService(
    access as unknown as FinanceAccessService,
    storage as unknown as SupabaseStorageService,
    outbox as unknown as OutboxService,
  );
  return { service, access, storage, tx, outbox };
}

describe("FinanceStatementDocumentService", () => {
  beforeEach(() => jest.clearAllMocks());

  it("stores a generated statement privately with a digest and immutable key", async () => {
    const { service, storage, tx, access } = setup([
      statement("GENERATING"),
      statement("READY", {
        key: "stored-key",
        digest: "b".repeat(64),
        size: 42,
      }),
    ]);

    await service.ensureReady(actor, statementId);

    const upload = storage.uploadObject.mock.calls[0][0];
    expect(upload.bucket).toBe("private");
    expect(upload.contentType).toBe("application/pdf");
    expect(upload.key).toMatch(
      new RegExp(
        `^tenants/${actor.tenantId}/finance-statements/${statementId}/[0-9a-f]{64}\\.pdf$`,
      ),
    );
    expect(tx.financeStatement.updateMany).toHaveBeenCalledWith({
      where: {
        id: statementId,
        tenantId: actor.tenantId,
        orgId: actor.orgId,
        status: "GENERATING",
      },
      data: expect.objectContaining({
        status: "READY",
        documentStorageKey: upload.key,
        documentSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        documentSizeBytes: upload.body.byteLength,
      }),
    });
    expect(access.assertStaffAction).toHaveBeenNthCalledWith(
      1,
      actor,
      "READ_RECORDS",
    );
    expect(access.assertStaffAction).toHaveBeenNthCalledWith(
      2,
      actor,
      "READ_RECORDS",
    );
  });

  it("rechecks payer permission before downloading a ready statement", async () => {
    const ready = statement("READY", {
      key: "tenants/tenant-a/finance-statements/statement.pdf",
      digest: "b".repeat(64),
      size: 3,
    });
    const { service, access, storage } = setup([ready, ready]);
    access.assertPayerAction
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new ForbiddenException("Grant revoked"));
    const originalBucket = process.env.SUPABASE_STORAGE_PRIVATE_BUCKET;
    process.env.SUPABASE_STORAGE_PRIVATE_BUCKET = "private-finance";

    try {
      await expect(
        service.download(payerActor, statementId, payerAccountId),
      ).rejects.toBeInstanceOf(ForbiddenException);
    } finally {
      if (originalBucket === undefined) {
        delete process.env.SUPABASE_STORAGE_PRIVATE_BUCKET;
      } else {
        process.env.SUPABASE_STORAGE_PRIVATE_BUCKET = originalBucket;
      }
    }

    expect(access.assertPayerAction).toHaveBeenCalledTimes(3);
    expect(access.assertPayerAction).toHaveBeenLastCalledWith(
      payerActor,
      payerActor.userId,
      payerAccountId,
      "DOWNLOAD_DOCUMENT",
    );
    expect(storage.downloadObject).not.toHaveBeenCalled();
  });

  it("returns verified private statement bytes while payer access remains current", async () => {
    const bytes = Buffer.from("private statement bytes");
    const ready = statement("READY", {
      key: "tenants/tenant-a/finance-statements/statement.pdf",
      digest: createHash("sha256").update(bytes).digest("hex"),
      size: bytes.length,
    });
    const { service, storage } = setup([ready, ready, ready]);
    storage.downloadObject.mockResolvedValue(bytes);
    const originalBucket = process.env.SUPABASE_STORAGE_PRIVATE_BUCKET;
    process.env.SUPABASE_STORAGE_PRIVATE_BUCKET = "private-finance";
    try {
      await expect(
        service.download(payerActor, statementId, payerAccountId),
      ).resolves.toEqual({ bytes, fileName: "statement-2026-09-01.pdf" });
    } finally {
      if (originalBucket === undefined)
        delete process.env.SUPABASE_STORAGE_PRIVATE_BUCKET;
      else process.env.SUPABASE_STORAGE_PRIVATE_BUCKET = originalBucket;
    }
  });

  it("denies statement delivery when the payer grant is revoked during private storage retrieval", async () => {
    const bytes = Buffer.from("private statement bytes");
    const ready = statement("READY", {
      key: "tenants/tenant-a/finance-statements/statement.pdf",
      digest: createHash("sha256").update(bytes).digest("hex"),
      size: bytes.length,
    });
    const { service, access, storage } = setup([ready, ready, ready]);
    let revoked = false;
    access.assertPayerAction.mockImplementation(async () => {
      if (revoked) throw new ForbiddenException("Grant revoked");
    });
    let resolveStorage!: (value: Buffer) => void;
    let storageStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      storageStarted = resolve;
    });
    const pendingStorage = new Promise<Buffer>((resolve) => {
      resolveStorage = resolve;
    });
    storage.downloadObject.mockImplementation(() => {
      storageStarted();
      return pendingStorage;
    });
    const originalBucket = process.env.SUPABASE_STORAGE_PRIVATE_BUCKET;
    process.env.SUPABASE_STORAGE_PRIVATE_BUCKET = "private-finance";
    try {
      const download = service.download(
        payerActor,
        statementId,
        payerAccountId,
      );
      const outcome = download.then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      );
      await started;
      revoked = true;
      resolveStorage(bytes);
      expect(await outcome).toEqual({ error: expect.any(ForbiddenException) });
    } finally {
      if (originalBucket === undefined)
        delete process.env.SUPABASE_STORAGE_PRIVATE_BUCKET;
      else process.env.SUPABASE_STORAGE_PRIVATE_BUCKET = originalBucket;
    }
  });
});
