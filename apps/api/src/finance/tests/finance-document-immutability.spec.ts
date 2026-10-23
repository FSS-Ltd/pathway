import {
  ForbiddenException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import type { FinanceAccessService } from "../access/finance-access.service";
import type { SupabaseStorageService } from "../../common/storage/supabase-storage.service";
import { renderFinancePdf } from "../finance-document-pdf";
import { FinanceDocumentService } from "../finance-document.service";

jest.mock("@pathway/db", () => ({ withTenantRlsContext: jest.fn() }));
jest.mock("../finance-document-pdf", () => ({ renderFinancePdf: jest.fn() }));

const actor = { tenantId: "tenant-a", orgId: "org-a", userId: "payer-a" };
const oldBytes = Buffer.from("%PDF-1.4 stored issued document");
const newBytes = Buffer.from("%PDF-1.4 changed renderer output");

function setup(existing: Buffer | null = null) {
  const objects = new Map<string, Buffer>();
  const key = "tenants/tenant-a/finance-documents/invoice-a/invoice.pdf";
  if (existing) objects.set(key, existing);
  const access = {
    assertPayerAction: jest.fn().mockResolvedValue(undefined),
    assertStaffAction: jest.fn().mockResolvedValue(undefined),
  };
  const storage = {
    privateBucketName: () => "private-finance",
    downloadObject: jest.fn(
      async (_bucket: string, objectKey: string) =>
        objects.get(objectKey) ?? null,
    ),
    uploadObject: jest.fn(
      async (input: {
        bucket: string;
        key: string;
        body: Buffer;
        overwrite?: boolean;
      }) => {
        if (input.overwrite !== false || !objects.has(input.key)) {
          objects.set(input.key, input.body);
        }
        return { bucket: input.bucket, key: input.key };
      },
    ),
  };
  const tx = {
    financeInvoice: {
      findFirst: jest.fn().mockResolvedValue({
        id: "invoice-a",
        invoiceNumber: 1001n,
        status: "ISSUED",
        issuedAt: new Date("2026-10-01T08:00:00Z"),
        dueAt: null,
        legalEntityNameSnapshot: "Synthetic School",
        payerNameSnapshot: "Synthetic Family",
        currency: "GBP",
        subtotalMinor: 1000n,
        taxMinor: 0n,
        totalMinor: 1000n,
        lines: [{ description: "Tuition", totalMinor: 1000n }],
      }),
    },
  };
  jest
    .mocked(withTenantRlsContext)
    .mockImplementation(async (_tenant, _org, fn) =>
      // This unit boundary supplies only the invoice read exercised by the service.
      fn(tx as never),
    );
  // Narrow unit doubles intentionally omit the injected services' other APIs.
  const restart = () =>
    new FinanceDocumentService(
      access as unknown as FinanceAccessService,
      storage as unknown as SupabaseStorageService,
    );
  return { service: restart(), restart, storage, access, objects, key };
}

describe("Finance issued document byte preservation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(renderFinancePdf).mockResolvedValue(newBytes);
  });

  it("returns the stored issued bytes without rendering or replacing them", async () => {
    const { service, storage } = setup(oldBytes);
    const document = await service.invoiceForPayer(
      actor,
      "payer-account-a",
      "invoice-a",
    );
    expect(document.bytes).toEqual(oldBytes);
    expect(renderFinancePdf).not.toHaveBeenCalled();
    expect(storage.uploadObject).not.toHaveBeenCalled();
    expect(storage.downloadObject).toHaveBeenCalledTimes(1);
  });

  it("returns the first committed object during concurrent first downloads", async () => {
    const { service, objects, key, storage } = setup();
    jest
      .mocked(renderFinancePdf)
      .mockResolvedValueOnce(oldBytes)
      .mockResolvedValueOnce(newBytes);
    const documents = await Promise.all([
      service.invoiceForPayer(actor, "payer-account-a", "invoice-a"),
      service.invoiceForPayer(actor, "payer-account-a", "invoice-a"),
    ]);
    expect(documents[0].bytes).toEqual(objects.get(key));
    expect(documents[1].bytes).toEqual(documents[0].bytes);
    for (const [input] of storage.uploadObject.mock.calls) {
      expect(input.overwrite).toBe(false);
    }
  });

  it("rechecks a revoked payer grant after reading existing bytes", async () => {
    const { service, access, storage } = setup(oldBytes);
    access.assertPayerAction
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new ForbiddenException("Grant revoked"));
    await expect(
      service.invoiceForPayer(actor, "payer-account-a", "invoice-a"),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(storage.uploadObject).not.toHaveBeenCalled();
    expect(access.assertPayerAction).toHaveBeenCalledTimes(2);
  });

  it("fails closed when a created object cannot be read back", async () => {
    const { service, storage } = setup();
    storage.downloadObject.mockResolvedValue(null);
    await expect(
      service.invoiceForPayer(actor, "payer-account-a", "invoice-a"),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("recovers the first stored bytes after losing an accepted upload response", async () => {
    const { service, restart, storage, objects } = setup();
    storage.uploadObject.mockImplementationOnce(async (input) => {
      objects.set(input.key, oldBytes);
      throw new Error("Synthetic response loss after upload");
    });
    await expect(
      service.invoiceForPayer(actor, "payer-account-a", "invoice-a"),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    const document = await restart().invoiceForPayer(
      actor,
      "payer-account-a",
      "invoice-a",
    );
    expect(document.bytes).toEqual(oldBytes);
    expect(renderFinancePdf).toHaveBeenCalledTimes(1);
    expect(storage.uploadObject).toHaveBeenCalledTimes(1);
  });
});
