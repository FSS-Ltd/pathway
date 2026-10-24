import request from "supertest";
import { requireDatabase } from "../../../test-helpers.e2e";
import {
  FINANCE_STATEMENT_NAME_READER,
  type FinanceStatementNameReader,
} from "../stripe/finance-statement-name-reader.provider";
import {
  createFinanceHttpFixture,
  type FinanceHttpFixture,
} from "./finance-http-auth.fixture";

// Replace only the external Stripe reader. HTTP auth, permissions, Finance
// entitlement, tenant RLS and the application service remain real.
describe("Finance statement-name HTTP boundaries", () => {
  let fixture: FinanceHttpFixture | undefined;
  let read: jest.SpyInstance;
  const path = "/finance/stripe-connection/statement-name";
  beforeAll(async () => {
    if (!requireDatabase()) return;
    fixture = await createFinanceHttpFixture();
    read = jest.spyOn(
      fixture.app.get<FinanceStatementNameReader>(
        FINANCE_STATEMENT_NAME_READER,
      ),
      "retrieve",
    );
  });
  beforeEach(async () => {
    if (!fixture) return;
    await fixture.setMode("ACTIVE");
    read.mockReset();
    read.mockImplementation(async (accountId: string) => ({
      id: accountId,
      livemode: false,
      country: "GB",
      dashboard: "full",
      prefix: null,
      descriptor:
        accountId === fixture?.f.connection.stripeAccountId
          ? "FIRST SCHOOL"
          : "OTHER SCHOOL",
    }));
  });
  afterAll(async () => {
    read?.mockRestore();
    await fixture?.app.close();
  });

  it("serves private provider evidence through the existing staff permission", async () => {
    if (!fixture) return;
    const response = await request(fixture.app.getHttpServer())
      .get(path)
      .set("Authorization", fixture.staffAuthorization);
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.body).toMatchObject({
      status: "CONNECTED",
      descriptor: "FIRST SCHOOL",
      canPrepare: false,
    });
    expect(read).toHaveBeenCalledWith(fixture.f.connection.stripeAccountId);
  });
  it("ignores a client account substitution and uses the other tenant's own connection", async () => {
    if (!fixture) return;
    const response = await request(fixture.app.getHttpServer())
      .get(`${path}?accountId=${fixture.f.connection.stripeAccountId}`)
      .set("Authorization", fixture.wrongTenantAuthorization);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      descriptor: "OTHER SCHOOL",
      accountReference: fixture.other.connection.stripeAccountId,
    });
    expect(response.text).not.toContain("FIRST SCHOOL");
    expect(read).not.toHaveBeenCalledWith(fixture.f.connection.stripeAccountId);
  });
  it("denies unauthorised staff and family users without reading Stripe", async () => {
    if (!fixture) return;
    for (const authorization of [
      fixture.deniedAuthorization,
      fixture.payerAuthorization,
    ]) {
      const response = await request(fixture.app.getHttpServer())
        .get(path)
        .set("Authorization", authorization);
      expect(response.status).toBe(403);
      expect(response.text).not.toMatch(/FIRST SCHOOL|acct_/);
    }
    expect(read).not.toHaveBeenCalled();
  });
  it("allows servicing reads and refuses locked direct access", async () => {
    if (!fixture) return;
    await fixture.setMode("SERVICING");
    const response = await request(fixture.app.getHttpServer())
      .get(path)
      .set("Authorization", fixture.staffAuthorization);
    expect(response.status).toBe(200);
    expect(response.body.canPrepare).toBe(false);
    await fixture.setMode("LOCKED");
    read.mockClear();
    const locked = await request(fixture.app.getHttpServer())
      .get(path)
      .set("Authorization", fixture.staffAuthorization);
    expect(locked.status).toBe(403);
    expect(locked.text).not.toContain("FIRST SCHOOL");
    expect(read).not.toHaveBeenCalled();
  });
  it("does not release an in-flight read after entitlement revocation", async () => {
    if (!fixture) return;
    read.mockImplementationOnce(async (accountId: string) => {
      await fixture?.setMode("LOCKED");
      return {
        id: accountId,
        livemode: false,
        country: "GB",
        dashboard: "full",
        prefix: null,
        descriptor: "REVOKED PRIVATE NAME",
      };
    });
    const response = await request(fixture.app.getHttpServer())
      .get(path)
      .set("Authorization", fixture.staffAuthorization);
    expect(response.status).toBe(403);
    expect(response.text).not.toContain("REVOKED PRIVATE NAME");
  });
});
