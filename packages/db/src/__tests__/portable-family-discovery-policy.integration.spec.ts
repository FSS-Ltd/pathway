import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { PrismaClientType } from "../index";

const describeIfDb =
  process.env.PATHWAY_RUN_DB_INTEGRATION_TESTS === "1"
    ? describe
    : describe.skip;

const migration = readFileSync(
  path.resolve(
    process.cwd(),
    "prisma/migrations/20261008020000_ace_family_context_discovery/migration.sql",
  ),
  "utf8",
);

describeIfDb("portable family identity discovery policies", () => {
  let prisma: PrismaClientType;

  beforeAll(async () => {
    const hostname = new URL(process.env.DATABASE_URL ?? "").hostname;
    if (hostname !== "localhost" && hostname !== "127.0.0.1") {
      throw new Error(
        `Refusing to run: DATABASE_URL host "${hostname}" is not local. ` +
          "Set DATABASE_URL to a disposable local database.",
      );
    }
    prisma = (await import("../index")).prisma;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  for (const layout of ["app", "split"] as const) {
    it(`creates self-discovery policies on ${layout} base tables, never views`, async () => {
      const rollback = new Error("rollback family policy probe");
      const suffix = randomUUID().replaceAll("-", "");
      const appSchema = `family_app_${suffix}`;
      const publicSchema = `family_public_${suffix}`;
      const baseSchema = layout === "app" ? appSchema : publicSchema;
      const testMigration = migration.replace(
        "ARRAY['app', 'public']",
        `ARRAY['${appSchema}', '${publicSchema}']`,
      );
      expect(testMigration).not.toBe(migration);

      await expect(
        prisma.$transaction(
          async (tx) => {
            await tx.$executeRawUnsafe(`CREATE SCHEMA "${appSchema}"`);
            await tx.$executeRawUnsafe(`CREATE SCHEMA "${publicSchema}"`);
            for (const table of ["GuardianIdentity", "StudentIdentity"]) {
              await tx.$executeRawUnsafe(`
                CREATE TABLE "${baseSchema}"."${table}" ("userId" text NOT NULL)
              `);
              await tx.$executeRawUnsafe(`
                INSERT INTO "${baseSchema}"."${table}" ("userId")
                VALUES ('reader'), ('other')
              `);
              await tx.$executeRawUnsafe(`
                ALTER TABLE "${baseSchema}"."${table}"
                ENABLE ROW LEVEL SECURITY
              `);
              await tx.$executeRawUnsafe(`
                ALTER TABLE "${baseSchema}"."${table}"
                FORCE ROW LEVEL SECURITY
              `);
            }
            if (layout === "split") {
              await tx.$executeRawUnsafe(`
                CREATE VIEW "${appSchema}"."StudentIdentity" AS
                SELECT "userId" FROM "${publicSchema}"."StudentIdentity"
              `);
            }

            await tx.$executeRawUnsafe(testMigration);
            const policies = await tx.$queryRaw<
              Array<{
                schemaname: string;
                tablename: string;
                policyname: string;
              }>
            >`
              SELECT schemaname, tablename, policyname
              FROM pg_catalog.pg_policies
              WHERE schemaname IN (${appSchema}, ${publicSchema})
              ORDER BY schemaname, tablename, policyname
            `;
            expect(policies).toEqual([
              {
                schemaname: baseSchema,
                tablename: "GuardianIdentity",
                policyname: "GuardianIdentity_self_discovery",
              },
              {
                schemaname: baseSchema,
                tablename: "StudentIdentity",
                policyname: "StudentIdentity_self_discovery",
              },
            ]);

            const [role] = await tx.$queryRaw<
              Array<{ isSuperuser: boolean; bypassRls: boolean }>
            >`
              SELECT rolsuper AS "isSuperuser", rolbypassrls AS "bypassRls"
              FROM pg_catalog.pg_roles WHERE rolname = current_user
            `;
            if (role && !role.isSuperuser && !role.bypassRls) {
              await tx.$executeRaw`SELECT set_config('app.user_id', 'reader', true)`;
              for (const table of ["GuardianIdentity", "StudentIdentity"]) {
                const [visible] = await tx.$queryRawUnsafe<
                  Array<{ count: number }>
                >(`
                  SELECT count(*)::int AS count
                  FROM "${baseSchema}"."${table}"
                `);
                expect(visible?.count).toBe(1);
              }
            }
            throw rollback;
          },
          { timeout: 30_000 },
        ),
      ).rejects.toBe(rollback);
    });
  }
});
