import { randomUUID } from "node:crypto";

/**
 * Integration test against a real Postgres instance (not mocked) — the thing under
 * test is the compound/unique DB constraints from the add_org_vertical_and_module
 * migration, which a mock can't verify.
 *
 * Gated on a dedicated flag rather than checking DATABASE_URL directly: importing
 * "../index" triggers @prisma/client's own bundled dotenv auto-loader, which walks
 * up from cwd and silently populates DATABASE_URL from the repo-root .env (a real,
 * non-local database) if nothing already set it — and that import is hoisted before
 * any guard in this file could run, so an "is DATABASE_URL set" check always sees it
 * as set. PATHWAY_RUN_DB_INTEGRATION_TESTS is not a key in that .env file, so it
 * can't be affected the same way. The hostname assertion below is a second,
 * independent guard in case DATABASE_URL is left unset even with the flag on.
 *
 * Run locally against the docker-compose db (infra/docker/docker-compose.yml):
 *   PATHWAY_RUN_DB_INTEGRATION_TESTS=1 \
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5433/pathway?schema=app \
 *     pnpm --filter @pathway/db test -- org-vertical-module
 */
const describeIfDb =
  process.env.PATHWAY_RUN_DB_INTEGRATION_TESTS === "1" ? describe : describe.skip;

describeIfDb("OrgVertical / OrgModule constraints", () => {
  let orgId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let Prisma: any;

  beforeAll(async () => {
    const db = await import("../index");
    prisma = db.prisma;
    Prisma = db.Prisma;

    const hostname = new URL(process.env.DATABASE_URL ?? "").hostname;
    if (hostname !== "localhost" && hostname !== "127.0.0.1") {
      throw new Error(
        `Refusing to run: DATABASE_URL host "${hostname}" is not local. ` +
          "Set DATABASE_URL to the docker-compose db before running this suite.",
      );
    }
  });

  beforeEach(async () => {
    const org = await prisma.org.create({
      data: {
        name: "Constraint test org",
        slug: `constraint-test-${randomUUID()}`,
        planCode: "trial",
      },
    });
    orgId = org.id;
  });

  afterEach(async () => {
    await prisma.orgModule.deleteMany({ where: { orgId } });
    await prisma.orgVertical.deleteMany({ where: { orgId } });
    await prisma.org.delete({ where: { id: orgId } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejects a second OrgVertical for the same org", async () => {
    await prisma.orgVertical.create({ data: { orgId, vertical: "CHURCH" } });

    await expect(
      prisma.orgVertical.create({ data: { orgId, vertical: "CLUB" } }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("rejects a duplicate [orgId, module] OrgModule row", async () => {
    await prisma.orgModule.create({
      data: { orgId, module: "FINANCE", status: "ACTIVE" },
    });

    await expect(
      prisma.orgModule.create({
        data: { orgId, module: "FINANCE", status: "ACTIVE" },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("allows a different module for the same org", async () => {
    await prisma.orgModule.create({
      data: { orgId, module: "FINANCE", status: "ACTIVE" },
    });

    await expect(
      prisma.orgModule.create({
        data: { orgId, module: "EVENTS", status: "ACTIVE" },
      }),
    ).resolves.toMatchObject({ module: "EVENTS" });
  });

  it("is a real Prisma known-request error, not a generic throw", async () => {
    await prisma.orgVertical.create({ data: { orgId, vertical: "CHURCH" } });

    try {
      await prisma.orgVertical.create({ data: { orgId, vertical: "CLUB" } });
      throw new Error("expected create to reject");
    } catch (err) {
      expect(err).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    }
  });
});
