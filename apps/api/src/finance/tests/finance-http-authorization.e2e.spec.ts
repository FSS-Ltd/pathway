import request, { type Response } from "supertest";
import { withTenantRlsContext } from "@pathway/db";
import { requireDatabase } from "../../../test-helpers.e2e";
import { renderFinancePdf } from "../finance-document-pdf";
import {
  createFinanceHttpFixture,
  HTTP_PDF_MARKER,
  HTTP_PRIVATE_NAME,
  type FinanceHttpFixture,
} from "./finance-http-auth.fixture";

// PDF rendering itself has a separate real-render suite. This marker makes
// accidental protected-byte delivery observable without contacting storage.
jest.mock("../finance-document-pdf", () => ({
  renderFinancePdf: jest.fn(async () =>
    Buffer.from("%PDF-1.4 synthetic-private-finance-http-evidence"),
  ),
}));

function expectNoProtectedResponse(response: Response): void {
  const content = `${response.text ?? ""}${JSON.stringify(response.body)}`;
  expect(content).not.toContain(HTTP_PDF_MARKER);
  expect(content).not.toContain(HTTP_PRIVATE_NAME);
  expect(content).not.toContain("documentStorageKey");
  expect(content).not.toMatch(/https?:\/\/[^\s"]+\/storage\//i);
  expect(response.headers["content-disposition"]).toBeUndefined();
}

describe("Finance actual HTTP authorization assurance", () => {
  let f: FinanceHttpFixture | undefined;
  const previousBucket = process.env.SUPABASE_STORAGE_PRIVATE_BUCKET;
  beforeAll(async () => {
    if (!requireDatabase()) return;
    process.env.SUPABASE_STORAGE_PRIVATE_BUCKET =
      "synthetic-private-http-bucket";
    f = await createFinanceHttpFixture();
  });
  afterAll(async () => {
    await f?.app.close();
    if (previousBucket === undefined)
      delete process.env.SUPABASE_STORAGE_PRIVATE_BUCKET;
    else process.env.SUPABASE_STORAGE_PRIVATE_BUCKET = previousBucket;
  });
  beforeEach(async () => {
    if (!f) return;
    await f.setMode("ACTIVE");
    f.storage.uploadObject.mockClear();
    f.storage.downloadObject.mockClear();
    jest.mocked(renderFinancePdf).mockClear();
  });

  it.each(["ACTIVE", "SERVICING"] as const)(
    "serves scoped historic staff and payer documents/statements and staff CSV privately in %s",
    async (mode) => {
      if (!f) return;
      await f.setMode(mode);
      for (const [paths, authorization] of [
        [f.staffPaths, f.staffAuthorization],
        [f.payerPaths, f.payerAuthorization],
      ] as const) {
        for (const path of paths) {
          const response = await request(f.app.getHttpServer())
            .get(path)
            .set("Authorization", authorization);
          expect({
            path,
            status: response.status,
            body: response.text,
          }).toMatchObject({ status: 200 });
          expect(response.headers["cache-control"]).toBe("private, no-store");
          expect(response.text ?? "").not.toMatch(
            /https?:\/\/[^\s"]+\/storage\//i,
          );
          if (path.endsWith("/document") || path.endsWith("/download")) {
            expect(response.headers["content-type"]).toContain(
              "application/pdf",
            );
            expect(response.headers["content-disposition"]).toContain(
              "attachment;",
            );
          }
          if (path.includes("/export?"))
            expect(response.headers["content-type"]).toContain("text/csv");
        }
      }
    },
  );

  it("denies all documents, statements and CSV when Finance is locked without touching renderer or storage", async () => {
    if (!f) return;
    await f.setMode("LOCKED");
    for (const [paths, authorization] of [
      [f.staffPaths, f.staffAuthorization],
      [f.payerPaths, f.payerAuthorization],
    ] as const) {
      for (const path of paths) {
        const response = await request(f.app.getHttpServer())
          .get(path)
          .set("Authorization", authorization);
        expect({ path, status: response.status }).toMatchObject({
          status: 403,
        });
        expectNoProtectedResponse(response);
      }
    }
    expect(f.storage.uploadObject).not.toHaveBeenCalled();
    expect(f.storage.downloadObject).not.toHaveBeenCalled();
    expect(renderFinancePdf).not.toHaveBeenCalled();
  });

  it("denies staff routes to a current member with no typed Finance role", async () => {
    if (!f) return;
    for (const path of f.staffPaths) {
      const response = await request(f.app.getHttpServer())
        .get(path)
        .set("Authorization", f.deniedAuthorization);
      expect({ path, status: response.status }).toMatchObject({ status: 403 });
      expectNoProtectedResponse(response);
    }
    expect(f.storage.uploadObject).not.toHaveBeenCalled();
    expect(f.storage.downloadObject).not.toHaveBeenCalled();
    expect(renderFinancePdf).not.toHaveBeenCalled();
  });

  it("does not deliver another tenant's identifiers or data to an independently permitted staff member", async () => {
    if (!f) return;
    for (const path of f.staffPaths) {
      const response = await request(f.app.getHttpServer())
        .get(path)
        .set("Authorization", f.wrongTenantAuthorization);
      if (path === "/finance/statements" || path.includes("/export?")) {
        expect(response.status).toBe(200);
        expect(response.headers["cache-control"]).toBe("private, no-store");
        expect(
          `${response.text ?? ""}${JSON.stringify(response.body)}`,
        ).not.toContain(HTTP_PRIVATE_NAME);
      } else {
        expect({ path, status: response.status }).toMatchObject({
          status: 404,
        });
        expectNoProtectedResponse(response);
      }
    }
    expect(f.storage.uploadObject).not.toHaveBeenCalled();
    expect(f.storage.downloadObject).not.toHaveBeenCalled();
    expect(renderFinancePdf).not.toHaveBeenCalled();
  });

  it("rejects a different payer account even when the user has an active grant for their own account", async () => {
    if (!f) return;
    for (const path of f.payerPaths) {
      const substituted = path.replace(f.f.payer.id, f.other.payer.id);
      const response = await request(f.app.getHttpServer())
        .get(substituted)
        .set("Authorization", f.payerAuthorization);
      expect(response.status).toBe(403);
      expectNoProtectedResponse(response);
    }
    expect(f.storage.uploadObject).not.toHaveBeenCalled();
    expect(f.storage.downloadObject).not.toHaveBeenCalled();
    expect(renderFinancePdf).not.toHaveBeenCalled();
  });

  it("rechecks current payer grants after an already successful document read", async () => {
    if (!f) return;
    const path = f.payerPaths[0];
    if (!path) throw new Error("Missing payer document path");
    expect(
      (
        await request(f.app.getHttpServer())
          .get(path)
          .set("Authorization", f.payerAuthorization)
      ).status,
    ).toBe(200);
    const grantId = f.f.grant.id;
    const revokedByUserId = f.f.actor.userId;
    await withTenantRlsContext(f.f.tenantId, f.f.orgId, (tx) =>
      tx.financePayerGrant.update({
        where: { id: grantId },
        data: { revokedAt: new Date(), revokedByUserId },
      }),
    );
    f.storage.uploadObject.mockClear();
    f.storage.downloadObject.mockClear();
    jest.mocked(renderFinancePdf).mockClear();
    for (const payerPath of f.payerPaths) {
      const response = await request(f.app.getHttpServer())
        .get(payerPath)
        .set("Authorization", f.payerAuthorization);
      expect(response.status).toBe(403);
      expectNoProtectedResponse(response);
    }
    expect(f.storage.uploadObject).not.toHaveBeenCalled();
    expect(f.storage.downloadObject).not.toHaveBeenCalled();
    expect(renderFinancePdf).not.toHaveBeenCalled();
  });
});
