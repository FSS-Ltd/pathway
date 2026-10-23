import { withTenantRlsContext } from "@pathway/db";
import { requireDatabase } from "../../../test-helpers.e2e";
import {
  SupabaseStorageService,
  type StorageUploadInput,
} from "../../common/storage/supabase-storage.service";
import { FinanceDocumentService } from "../finance-document.service";
import { FinanceStripeCheckoutAttemptService } from "../stripe/finance-stripe-checkout-attempt.service";
import { FinanceStripeCheckoutService } from "../stripe/finance-stripe-checkout.service";
import type {
  FinanceStripeCheckoutProvider,
  FinanceStripeCheckoutSession,
} from "../stripe/finance-stripe-checkout.provider";
import { createFinanceAssuranceFixture } from "./finance-assurance.fixture";
import { prepareAssuranceProviderSuccess } from "./finance-assurance-provider.fixture";

// PDF rendering has separate real-render coverage; this test observes document
// identity and private storage without provider/storage network operations.
jest.mock("../finance-document-pdf", () => ({
  renderFinancePdf: jest.fn(async () =>
    Buffer.from("%PDF-1.4 synthetic receipt identity"),
  ),
}));
class ReceiptStorage extends SupabaseStorageService {
  readonly keys = new Set<string>();
  private readonly objects = new Map<string, Buffer>();
  override privateBucketName() {
    return "private-finance-assurance";
  }
  override async downloadObject(_bucket: string, key: string) {
    return this.objects.get(key) ?? null;
  }
  override async uploadObject(input: StorageUploadInput) {
    this.keys.add(input.key);
    if (input.overwrite !== false || !this.objects.has(input.key)) {
      this.objects.set(input.key, input.body);
    }
    return { bucket: input.bucket, key: input.key };
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const config = {
  mode: "test",
  secretKey: "sk_test_assurance_fixture",
  webAppUrl: "https://family.example.test",
} as const;

describe("Finance delivery and simultaneous Checkout assurance", () => {
  beforeAll(() => {
    if (!requireDatabase())
      throw new Error(
        "Checkout assurance requires the central disposable database",
      );
  });

  it("posts five concurrent deliveries once and keeps one receipt document identity", async () => {
    const f = await createFinanceAssuranceFixture();
    const invoiceId = await f.createIssuedInvoice("500");
    const deliver = await prepareAssuranceProviderSuccess(
      f,
      invoiceId,
      "card",
      500,
    );
    expect(
      await Promise.all(Array.from({ length: 5 }, () => deliver())),
    ).toEqual(Array(5).fill("processed"));
    const receipts = await withTenantRlsContext(
      f.tenantId,
      f.orgId,
      async (tx) => {
        expect(
          await tx.financeReceiptAllocation.findMany({
            where: { tenantId: f.tenantId, orgId: f.orgId, invoiceId },
            select: { amountMinor: true },
          }),
        ).toEqual([{ amountMinor: 500n }]);
        return tx.financeReceipt.findMany({
          where: {
            tenantId: f.tenantId,
            orgId: f.orgId,
            payerAccountId: f.payer.id,
          },
        });
      },
    );
    expect(receipts).toHaveLength(1);
    const receipt = receipts[0];
    if (!receipt) throw new Error("Missing canonical receipt");
    expect(receipt).toMatchObject({ amountMinor: 500n, status: "CONFIRMED" });
    const storage = new ReceiptStorage();
    const documents = new FinanceDocumentService(f.access, storage);
    const first = await documents.receiptForPayer(
      f.payerActor,
      f.payer.id,
      receipt.id,
    );
    // New handler/service instances model an application restart, not a new
    // receipt operation or a fresh provider payment.
    await deliver();
    const restarted = await new FinanceDocumentService(
      f.access,
      storage,
    ).receiptForPayer(f.payerActor, f.payer.id, receipt.id);
    expect(restarted.fileName).toBe(first.fileName);
    expect(storage.keys.size).toBe(1);
    expect([...storage.keys][0]).toContain(receipt.id);
    expect(
      (await f.invoices.get(f.actor, invoiceId)).balance.outstandingMinor,
    ).toBe("0");
  });

  it("shares one durable attempt and payable provider object across overlapping tabs and restart", async () => {
    const f = await createFinanceAssuranceFixture();
    const invoiceId = await f.createIssuedInvoice("500");
    const releaseProvider = deferred<void>();
    const providerEntered = deferred<void>();
    const secondPrepared = deferred<void>();
    const objects = new Map<string, FinanceStripeCheckoutSession>();
    const receivedKeys: string[] = [];
    const provider: FinanceStripeCheckoutProvider = {
      async createSession(input) {
        receivedKeys.push(input.idempotencyKey);
        let session = objects.get(input.idempotencyKey);
        if (!session) {
          session = {
            id: "cs_test_single_payable",
            url: "https://checkout.stripe.com/c/pay/single",
            expiresAt: new Date(Date.now() + 3_600_000),
          };
          objects.set(input.idempotencyKey, session);
        }
        providerEntered.resolve();
        await releaseProvider.promise;
        return session;
      },
      async expireSession() {
        throw new Error("No expiry expected");
      },
      async retrieveSession() {
        throw new Error("No retrieval expected");
      },
    };
    const attempts = new FinanceStripeCheckoutAttemptService(
      f.access,
      f.balances,
      config,
    );
    const actualPrepare = attempts.prepare.bind(attempts);
    let preparations = 0;
    jest.spyOn(attempts, "prepare").mockImplementation(async (...args) => {
      const result = await actualPrepare(...args);
      preparations += 1;
      if (preparations === 2) secondPrepared.resolve();
      return result;
    });
    const checkout = new FinanceStripeCheckoutService(
      f.access,
      attempts,
      config,
      provider,
    );
    const first = checkout.startCheckout(f.payerActor, f.payer.id, invoiceId);
    try {
      await providerEntered.promise;
      const second = checkout.startCheckout(
        f.payerActor,
        f.payer.id,
        invoiceId,
      );
      await secondPrepared.promise;
      releaseProvider.resolve();
      const results = await Promise.all([first, second]);
      expect(results[0]).toEqual(results[1]);
      expect(objects.size).toBe(1);
      expect(new Set(receivedKeys).size).toBe(1);
      const restarted = new FinanceStripeCheckoutService(
        f.access,
        new FinanceStripeCheckoutAttemptService(f.access, f.balances, config),
        config,
        provider,
      );
      expect(
        await restarted.startCheckout(f.payerActor, f.payer.id, invoiceId),
      ).toEqual(results[0]);
      expect(objects.size).toBe(1);
      await withTenantRlsContext(f.tenantId, f.orgId, async (tx) => {
        expect(
          await tx.financeCheckoutAttempt.count({
            where: { tenantId: f.tenantId, orgId: f.orgId, invoiceId },
          }),
        ).toBe(1);
        expect(
          await tx.financeReceipt.count({
            where: { tenantId: f.tenantId, orgId: f.orgId },
          }),
        ).toBe(0);
      });
      expect(
        (await f.invoices.get(f.actor, invoiceId)).balance.outstandingMinor,
      ).toBe("500");
    } finally {
      releaseProvider.resolve();
    }
  });
});
