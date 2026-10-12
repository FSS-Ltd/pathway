import { randomUUID } from "node:crypto";
import request from "supertest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import {
  BillingProvider,
  InstitutionalSnapshotStatus,
  prisma,
  SubscriptionStatus,
  withTenantRlsContext,
} from "@pathway/db";
import { AppModule } from "../../../app.module";
import { requireDatabase, seedE2eAuthUser } from "../../../../test-helpers.e2e";
import { EnrolmentIdentitiesService } from "../../../enrolments/enrolment-identities.service";
import { EnrolmentRollService } from "../../../enrolments/enrolment-roll.service";
import { InstitutionalCensusService } from "../institutional-census.service";
import { InstitutionalQuoteService } from "../institutional-quote.service";
import { censusCutoffFor, localDateAt } from "../institutional-time";

const starter = "INSTITUTIONAL_STARTER_MONTHLY";

describe("institutional quotes and census (e2e)", () => {
  let app: INestApplication;
  let quotes: InstitutionalQuoteService;
  let census: InstitutionalCensusService;
  let identities: EnrolmentIdentitiesService;
  let roll: EnrolmentRollService;
  let orgId: string;
  let tenantId: string;
  let actorId: string;
  let adminId: string;
  let billingHeader: string;

  beforeAll(async () => {
    if (!requireDatabase()) return;
    orgId = randomUUID();
    tenantId = randomUUID();
    await prisma.org.create({
      data: {
        id: orgId,
        name: "Quote e2e",
        slug: `quote-${orgId}`,
        planCode: "starter",
      },
    });
    await prisma.tenant.create({
      data: {
        id: tenantId,
        orgId,
        name: "Main site",
        slug: `quote-${tenantId}`,
        timezone: "Europe/London",
      },
    });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    quotes = app.get(InstitutionalQuoteService);
    census = app.get(InstitutionalCensusService);
    identities = app.get(EnrolmentIdentitiesService);
    roll = app.get(EnrolmentRollService);
    const billing = await seedE2eAuthUser({
      subject: `quote-billing-${orgId}`,
      tenantId,
      orgId,
      orgRole: "ORG_BILLING",
    });
    billingHeader = billing.authorization;
    actorId = billing.userId;
    const admin = await seedE2eAuthUser({
      subject: `quote-admin-${orgId}`,
      tenantId,
      orgId,
      orgRole: "ORG_ADMIN",
    });
    adminId = admin.userId;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it("rejects worker dispatch without the internal secret", async () => {
    if (!app) return;
    const response = await request(app.getHttpServer())
      .post(`/billing/institutional/internal/operations/${randomUUID()}`)
      .send();
    expect(response.status).toBe(401);
  });

  it("offers public monthly catalogue and child-count estimates without checkout", async () => {
    if (!app) return;
    const catalogue = await request(app.getHttpServer()).get(
      "/billing/institutional/catalogue",
    );
    expect(catalogue.status).toBe(200);
    expect(catalogue.body.plans).toHaveLength(3);
    expect(
      catalogue.body.plans.every(
        (plan: { checkoutEnabled: boolean }) => !plan.checkoutEnabled,
      ),
    ).toBe(true);

    const estimate = await request(app.getHttpServer())
      .post("/billing/institutional/catalogue/estimate")
      .send({ planCode: starter, enrolledChildren: 100 });
    expect(estimate.status).toBe(201);
    expect(estimate.body).toMatchObject({
      kind: "priced",
      enrolledChildren: 100,
      subtotalPence: 12400,
    });
  });

  it("requires an accepted declaration, preserves zero as base-fee billing, and rejects stale quotes", async () => {
    if (!app) return;
    const missing = await request(app.getHttpServer())
      .post("/billing/institutional/quotes")
      .set("Authorization", billingHeader)
      .send({ planCode: starter });
    expect(missing.status).toBe(409);
    expect(missing.body.code).toBe("ROLL_REVIEW_REQUIRED");

    const unaccepted = await request(app.getHttpServer())
      .post("/billing/institutional/quotes")
      .set("Authorization", billingHeader)
      .send({ planCode: starter, declaredChildren: 0 });
    expect(unaccepted.status).toBe(400);

    const first = await request(app.getHttpServer())
      .post("/billing/institutional/quotes")
      .set("Authorization", billingHeader)
      .send({
        planCode: starter,
        declaredChildren: 0,
        declarationAccepted: true,
      });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({
      status: "PRICED",
      countSource: "DECLARED",
      enrolledChildren: 0,
      subtotalPence: 4900,
      includedModules: [],
      paidModules: [],
    });
    expect(first.body.lines).toEqual([
      {
        component: "BASE",
        quantity: 1,
        unitAmountPence: 4900,
        subtotalPence: 4900,
      },
    ]);

    const second = await quotes.createQuote(orgId, actorId, {
      planCode: starter,
      includedModules: [],
      paidModules: [],
      declaredChildren: 1,
      declarationAccepted: true,
    });
    await expect(
      quotes.acceptQuote(orgId, actorId, first.body.id, `stale-${orgId}`),
    ).rejects.toMatchObject({ status: 409 });
    const accepted = await quotes.acceptQuote(
      orgId,
      actorId,
      second.id,
      `accepted-${orgId}`,
    );
    expect(accepted.snapshotId).toBe(second.id);
    const disabledCheckout = await request(app.getHttpServer())
      .post("/billing/institutional/checkout")
      .set("Authorization", billingHeader)
      .send({ snapshotId: second.id, idempotencyKey: `checkout-${orgId}` });
    expect(disabledCheckout.status).toBe(503);
    expect(disabledCheckout.body.code).toBe("INSTITUTIONAL_CHECKOUT_DISABLED");
    expect(
      await prisma.pendingOrder.count({
        where: { orgId, institutionalSnapshotId: second.id },
      }),
    ).toBe(0);
    expect(
      (await quotes.acceptQuote(orgId, actorId, second.id, `accepted-${orgId}`))
        .id,
    ).toBe(accepted.id);
    await expect(
      quotes.acceptQuote(orgId, actorId, second.id, `different-${orgId}`),
    ).rejects.toMatchObject({ status: 409 });
    const otherOrgId = randomUUID();
    const otherTenantId = randomUUID();
    await prisma.org.create({
      data: {
        id: otherOrgId,
        name: "Other quote org",
        slug: `quote-${otherOrgId}`,
        planCode: "starter",
      },
    });
    await prisma.tenant.create({
      data: {
        id: otherTenantId,
        orgId: otherOrgId,
        name: "Other site",
        slug: `quote-${otherTenantId}`,
        timezone: "Europe/London",
      },
    });
    const otherBilling = await seedE2eAuthUser({
      subject: `quote-other-${otherOrgId}`,
      tenantId: otherTenantId,
      orgId: otherOrgId,
      orgRole: "ORG_BILLING",
    });
    const crossOrg = await request(app.getHttpServer())
      .get(`/billing/institutional/quotes/${second.id}`)
      .set("Authorization", otherBilling.authorization);
    expect(crossOrg.status).toBe(404);
    const unverifiedSubscription = await prisma.subscription.create({
      data: {
        orgId: otherOrgId,
        provider: BillingProvider.STRIPE,
        providerSubId: `sub_unverified_${randomUUID()}`,
        planCode: starter,
        status: SubscriptionStatus.ACTIVE,
        periodStart: new Date(Date.now() - 29 * 24 * 60 * 60 * 1_000),
        periodEnd: new Date(Date.now() + 24 * 60 * 60 * 1_000),
      },
    });
    const review = await census.freezeNext(unverifiedSubscription.id);
    expect(review.kind).toBe("frozen");
    if (review.kind !== "frozen") throw new Error("Expected review snapshot");
    expect(review.snapshot).toMatchObject({
      status: InstitutionalSnapshotStatus.REVIEW_REQUIRED,
      enrolledChildren: null,
      subtotalPence: null,
      lines: [],
    });
    const expired = await quotes.createQuote(
      orgId,
      actorId,
      { planCode: starter, includedModules: [], paidModules: [] },
      new Date(Date.now() - 16 * 60 * 1_000),
    );
    await expect(
      quotes.acceptQuote(orgId, actorId, expired.id, `expired-${orgId}`),
    ).rejects.toMatchObject({ status: 409 });

    const tooMany = await quotes.createQuote(orgId, actorId, {
      planCode: starter,
      includedModules: [],
      paidModules: [],
      declaredChildren: 251,
      declarationAccepted: true,
    });
    expect(tooMany.status).toBe(InstitutionalSnapshotStatus.CONTACT_SALES);
    expect(tooMany.subtotalPence).toBeNull();
    expect(tooMany.lines).toEqual([]);
    await expect(
      quotes.acceptQuote(orgId, actorId, tooMany.id, `over250-${orgId}`),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      quotes.createQuote(orgId, actorId, {
        planCode: starter,
        includedModules: [],
        paidModules: ["FINANCE"],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("uses the confirmed roll, rejects changed counts, and keeps a late correction out of the frozen renewal", async () => {
    if (!app) return;
    const child = await withTenantRlsContext(tenantId, orgId, (tx) =>
      tx.child.create({
        data: { tenantId, firstName: "Private", lastName: "Child" },
        select: { id: true },
      }),
    );
    const identity = await identities.createIdentity(
      orgId,
      tenantId,
      "BILL-ONE",
      child.id,
    );
    await roll.recordChange(
      orgId,
      identity.id,
      adminId,
      "admit",
      "2026-01-01",
      undefined,
      "Confirmed admission",
    );
    const effectiveOn = localDateAt(new Date(), "Europe/London");
    await roll.confirmRoll(orgId, adminId, effectiveOn, false);
    const verified = await quotes.createQuote(orgId, actorId, {
      planCode: starter,
      includedModules: [],
      paidModules: [],
    });
    expect(verified.countSource).toBe("VERIFIED");
    expect(verified.enrolledChildren).toBe(1);
    await expect(
      quotes.createQuote(orgId, actorId, {
        planCode: starter,
        includedModules: [],
        paidModules: [],
        declaredChildren: 0,
        declarationAccepted: true,
      }),
    ).rejects.toMatchObject({ status: 409 });

    const nextChild = await withTenantRlsContext(tenantId, orgId, (tx) =>
      tx.child.create({
        data: { tenantId, firstName: "Second", lastName: "Child" },
        select: { id: true },
      }),
    );
    const nextIdentity = await identities.createIdentity(
      orgId,
      tenantId,
      "BILL-TWO",
      nextChild.id,
    );
    await roll.recordChange(
      orgId,
      nextIdentity.id,
      adminId,
      "admit",
      "2026-01-01",
      undefined,
      "Second admission",
    );
    const beforeReconfirmation = await quotes.createQuote(orgId, actorId, {
      planCode: starter,
      includedModules: [],
      paidModules: [],
    });
    expect(beforeReconfirmation.enrolledChildren).toBe(1);
    await roll.confirmRoll(orgId, adminId, effectiveOn, false);
    await expect(
      quotes.acceptQuote(
        orgId,
        actorId,
        beforeReconfirmation.id,
        `changed-${orgId}`,
      ),
    ).rejects.toMatchObject({ status: 409 });

    const refreshed = await quotes.createQuote(orgId, actorId, {
      planCode: starter,
      includedModules: [],
      paidModules: [],
    });
    const accepted = await quotes.acceptQuote(
      orgId,
      actorId,
      refreshed.id,
      `refreshed-${orgId}`,
    );
    expect(accepted.snapshotId).toBe(refreshed.id);

    const periodEnd = new Date(Date.now() + 10 * 24 * 60 * 60 * 1_000);
    const subscription = await prisma.subscription.create({
      data: {
        orgId,
        provider: BillingProvider.STRIPE,
        providerSubId: `sub_quote_${randomUUID()}`,
        planCode: starter,
        status: SubscriptionStatus.ACTIVE,
        periodStart: new Date(Date.now() - 20 * 24 * 60 * 60 * 1_000),
        periodEnd,
        currentInstitutionalSnapshotId: refreshed.id,
      },
    });
    const planChange = await quotes.createQuote(orgId, actorId, {
      planCode: "INSTITUTIONAL_GROWTH_MONTHLY",
      includedModules: [],
      paidModules: [],
    });
    await quotes.acceptQuote(
      orgId,
      actorId,
      planChange.id,
      `growth-change-${orgId}`,
    );
    const cutoff = censusCutoffFor(periodEnd);
    expect(
      (await census.freezeNext(subscription.id, new Date(cutoff.getTime() - 1)))
        .kind,
    ).toBe("not_due");
    const unconfirmedChild = await withTenantRlsContext(tenantId, orgId, (tx) =>
      tx.child.create({
        data: { tenantId, firstName: "Unconfirmed", lastName: "Child" },
        select: { id: true },
      }),
    );
    const unconfirmedIdentity = await identities.createIdentity(
      orgId,
      tenantId,
      "BILL-THREE",
      unconfirmedChild.id,
    );
    await roll.recordChange(
      orgId,
      unconfirmedIdentity.id,
      adminId,
      "admit",
      "2026-01-01",
      undefined,
      "Unconfirmed admission",
    );
    await prisma.enrolmentRevision.create({
      data: {
        orgId,
        identityId: identity.id,
        version: 2,
        periods: [{ admittedOn: "2026-01-01", leftOn: "2026-02-01" }],
        reason: "Late evidence after census cutoff",
        actorUserId: adminId,
        recordedAt: new Date(cutoff.getTime() + 24 * 60 * 60 * 1_000),
      },
    });
    const frozen = await census.freezeNext(
      subscription.id,
      new Date(cutoff.getTime() + 2 * 24 * 60 * 60 * 1_000),
    );
    expect(frozen.kind).toBe("frozen");
    if (frozen.kind !== "frozen") throw new Error("Expected frozen census");
    expect(frozen.snapshot.enrolledChildren).toBe(2);
    expect(frozen.snapshot.planCode).toBe("INSTITUTIONAL_GROWTH_MONTHLY");
    expect(frozen.snapshot.subtotalPence).toBe(9900);
    expect(frozen.snapshot.censusCutoffAt?.toISOString()).toBe(
      cutoff.toISOString(),
    );
    expect(
      (
        await census.freezeNext(
          subscription.id,
          new Date(cutoff.getTime() + 3 * 24 * 60 * 60 * 1_000),
        )
      ).kind,
    ).toBe("frozen");
    const summary = await request(app.getHttpServer())
      .get("/billing/institutional/summary")
      .set("Authorization", billingHeader);
    expect(summary.status).toBe(200);
    expect(summary.body.currentPaid.subtotalPence).toBe(4900);
    expect(summary.body.frozenRenewal.enrolledChildren).toBe(2);
    expect(summary.body.frozenRenewal.planCode).toBe(
      "INSTITUTIONAL_GROWTH_MONTHLY",
    );
    expect(JSON.stringify(summary.body)).not.toContain("Private");

    const lateAcceptedAt = new Date(cutoff.getTime() + 60 * 60_000);
    const lateChange = await quotes.createQuote(
      orgId,
      actorId,
      {
        planCode: "INSTITUTIONAL_PROFESSIONAL_MONTHLY",
        includedModules: [],
        paidModules: [],
      },
      lateAcceptedAt,
    );
    await quotes.acceptQuote(
      orgId,
      actorId,
      lateChange.id,
      `late-change-${orgId}`,
      lateAcceptedAt,
    );
    const unchanged = await census.freezeNext(
      subscription.id,
      new Date(cutoff.getTime() + 2 * 24 * 60 * 60_000),
    );
    expect(unchanged.kind).toBe("frozen");
    if (unchanged.kind !== "frozen") throw new Error("Expected frozen census");
    expect(unchanged.snapshot.planCode).toBe("INSTITUTIONAL_GROWTH_MONTHLY");

    const followingEnd = new Date(periodEnd.getTime() + 30 * 24 * 60 * 60_000);
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        planCode: "INSTITUTIONAL_GROWTH_MONTHLY",
        periodStart: periodEnd,
        periodEnd: followingEnd,
        currentInstitutionalSnapshotId: frozen.snapshot.id,
        nextInstitutionalSnapshotId: null,
      },
    });
    const following = await census.freezeNext(
      subscription.id,
      censusCutoffFor(followingEnd),
    );
    expect(following.kind).toBe("frozen");
    if (following.kind !== "frozen")
      throw new Error("Expected following census");
    expect(following.snapshot.planCode).toBe(
      "INSTITUTIONAL_PROFESSIONAL_MONTHLY",
    );
  });
});
