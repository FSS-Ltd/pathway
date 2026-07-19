import { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../app.module";
import type { PathwayAuthClaims } from "@pathway/auth";
import {
  OrgRole,
  SiteRole,
  Vertical,
  withTenantRlsContext,
} from "@pathway/db";
import { VERTICAL_CAPABILITIES } from "@pathway/platform";
import { requireDatabase } from "../../../test-helpers.e2e";

// Orgs e2e: reuse seeded E2E org/tenant; avoid creating new orgs (RLS)

describe("Orgs (e2e)", () => {
  let app: INestApplication;
  const orgId = process.env.E2E_ORG_ID as string;
  const tenantId = process.env.E2E_TENANT_ID as string;
  const orgSlug = "e2e-org";
  const tenantSlug = "e2e-tenant-a";
  const userId = randomUUID();
  const authSubject = `orgs-e2e-${userId}`;
  const userEmail = `${authSubject}@pathway.test`;
  let originalVertical: Vertical | null = null;
  let authHeader: string;

  const buildAuthHeader = (claims: PathwayAuthClaims) => {
    const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
    return `Bearer test.${payload}.sig`;
  };

  beforeAll(async () => {
    if (!requireDatabase()) {
      return;
    }

    if (!orgId || !tenantId)
      throw new Error("E2E_ORG_ID / E2E_TENANT_ID missing");

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    await withTenantRlsContext(tenantId, orgId, async (tx) => {
      const currentVertical = await tx.orgVertical.findUnique({
        where: { orgId },
      });
      originalVertical = currentVertical?.vertical ?? null;
      await tx.user.create({
        data: {
          id: userId,
          email: userEmail,
          name: "Orgs E2E Admin",
          tenantId,
          lastActiveTenantId: tenantId,
        },
      });
      await tx.userIdentity.create({
        data: {
          userId,
          provider: "auth0",
          providerSubject: authSubject,
          email: userEmail,
        },
      });
      await tx.orgMembership.create({
        data: { userId, orgId, role: OrgRole.ORG_ADMIN },
      });
      await tx.siteMembership.create({
        data: { userId, tenantId, role: SiteRole.SITE_ADMIN },
      });
    });

    authHeader = buildAuthHeader({
      sub: authSubject,
      email: userEmail,
      "https://pathway.app/user": { id: userId, email: userEmail },
      "https://pathway.app/org": { orgId, slug: orgSlug, name: "E2E Org" },
      "https://pathway.app/tenant": { tenantId, orgId, slug: tenantSlug },
      "https://pathway.app/org_roles": ["org:admin"],
      "https://pathway.app/tenant_roles": ["tenant:admin"],
    });
  });

  afterAll(async () => {
    if (requireDatabase()) {
      await withTenantRlsContext(tenantId, orgId, async (tx) => {
        if (originalVertical) {
          await tx.orgVertical.upsert({
            where: { orgId },
            create: { orgId, vertical: originalVertical },
            update: { vertical: originalVertical },
          });
        } else {
          await tx.orgVertical.deleteMany({ where: { orgId } });
        }
        await tx.siteMembership.deleteMany({ where: { userId } });
        await tx.orgMembership.deleteMany({ where: { userId } });
        await tx.userIdentity.deleteMany({ where: { userId } });
        await tx.user.deleteMany({ where: { id: userId } });
      }).catch(() => undefined);
    }
    if (app) {
      await app.close();
    }
  });

  it("GET /orgs/:slug should return seeded org", async () => {
    if (!app) return;
    const res = await request(app.getHttpServer())
      .get(`/orgs/${orgSlug}`)
      .set("Authorization", authHeader);
    expect(res.status).toBe(200);
    expect(res.body.slug).toBe(orgSlug);
    expect(res.body.id).toBe(orgId);
  });

  it("GET /orgs should list orgs including the seeded one", async () => {
    if (!app) return;
    const res = await request(app.getHttpServer())
      .get("/orgs")
      .set("Authorization", authHeader);
    expect(res.status).toBe(200);
    const slugs: string[] = res.body.map((o: { slug: string }) => o.slug);
    expect(slugs.includes(orgSlug)).toBe(true);
  });

  it("GET /orgs/:slug should 404 for unknown org", async () => {
    if (!app) return;
    const res = await request(app.getHttpServer())
      .get(`/orgs/unknown-${Date.now()}`)
      .set("Authorization", authHeader);
    expect(res.status).toBe(404);
  });

  it("PATCH /orgs/current/vertical upserts and immediately changes capabilities", async () => {
    if (!app) return;

    const firstUpdate = await request(app.getHttpServer())
      .patch("/orgs/current/vertical")
      .set("Authorization", authHeader)
      .send({ vertical: Vertical.CHURCH });
    expect(firstUpdate.status).toBe(200);

    const secondUpdate = await request(app.getHttpServer())
      .patch("/orgs/current/vertical")
      .set("Authorization", authHeader)
      .send({ vertical: Vertical.CLUB });
    expect(secondUpdate.status).toBe(200);
    expect(secondUpdate.body).toMatchObject({ orgId, vertical: Vertical.CLUB });

    const rows = await withTenantRlsContext(tenantId, orgId, (tx) =>
      tx.orgVertical.findMany({ where: { orgId } }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.vertical).toBe(Vertical.CLUB);

    const capabilities = await request(app.getHttpServer())
      .get("/platform/capabilities")
      .set("Authorization", authHeader);
    expect(capabilities.status).toBe(200);
    expect(capabilities.body.capabilities).toEqual(
      expect.arrayContaining(VERTICAL_CAPABILITIES.CLUB),
    );
  });
});
