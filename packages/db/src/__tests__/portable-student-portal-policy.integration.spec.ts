import { randomUUID } from "node:crypto";
import type { PrismaClientType } from "../index";

const describeIfDb =
  process.env.PATHWAY_RUN_DB_INTEGRATION_TESTS === "1"
    ? describe
    : describe.skip;

describeIfDb("student portal policy in the link schema", () => {
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

  it("requires an enabled same-tenant policy for active links but permits closure", async () => {
    const rollback = new Error("rollback student portal policy probe");
    const schema = `"student_policy_${randomUUID().replaceAll("-", "")}"`;

    await expect(
      prisma.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(`CREATE SCHEMA ${schema}`);
          await tx.$executeRawUnsafe(`
            CREATE TABLE ${schema}."StudentPortalPolicy" (
              "tenantId" text, "studentPortalEnabled" boolean)
          `);
          await tx.$executeRawUnsafe(`
            CREATE TABLE ${schema}."StudentIdentityLink" (
              "id" text, "tenantId" text, "endedAt" timestamptz,
              "revokedAt" timestamptz)
          `);
          await tx.$executeRawUnsafe(`
            CREATE TRIGGER require_policy
            BEFORE INSERT OR UPDATE OF "tenantId", "endedAt", "revokedAt"
            ON ${schema}."StudentIdentityLink" FOR EACH ROW
            EXECUTE FUNCTION app.require_student_portal_link_policy()
          `);
          await tx.$executeRawUnsafe(`
            INSERT INTO ${schema}."StudentPortalPolicy" VALUES
              ('tenant-a', true), ('tenant-b', false)
          `);
          await tx.$executeRawUnsafe(`
            INSERT INTO ${schema}."StudentIdentityLink" ("id", "tenantId")
            VALUES ('active', 'tenant-a')
          `);
          await tx.$executeRawUnsafe(`
            UPDATE ${schema}."StudentPortalPolicy"
            SET "studentPortalEnabled" = false WHERE "tenantId" = 'tenant-a'
          `);
          await tx.$executeRawUnsafe(`
            UPDATE ${schema}."StudentIdentityLink"
            SET "endedAt" = now() WHERE "id" = 'active'
          `);
          await tx.$executeRawUnsafe(`
            INSERT INTO ${schema}."StudentIdentityLink"
              ("id", "tenantId", "endedAt")
            VALUES ('ended', 'tenant-b', now())
          `);
          await tx.$executeRawUnsafe(`
            INSERT INTO ${schema}."StudentIdentityLink"
              ("id", "tenantId", "revokedAt")
            VALUES ('revoked', 'tenant-c', now())
          `);
          await tx.$executeRawUnsafe(`
            DO $probe$ BEGIN
              BEGIN
                INSERT INTO ${schema}."StudentIdentityLink" ("id", "tenantId")
                VALUES ('disabled', 'tenant-b');
                RAISE EXCEPTION 'Disabled policy accepted';
              EXCEPTION WHEN check_violation THEN
                IF SQLERRM <> 'Active student identity links require an enabled student portal policy'
                THEN RAISE; END IF;
              END;
              BEGIN
                INSERT INTO ${schema}."StudentIdentityLink" ("id", "tenantId")
                VALUES ('absent', 'tenant-c');
                RAISE EXCEPTION 'Missing tenant policy accepted';
              EXCEPTION WHEN check_violation THEN
                IF SQLERRM <> 'Active student identity links require an enabled student portal policy'
                THEN RAISE; END IF;
              END;
            END $probe$
          `);

          const rows = await tx.$queryRawUnsafe<Array<{ count: bigint }>>(`
            SELECT count(*) AS count FROM ${schema}."StudentIdentityLink"
          `);
          expect(rows).toEqual([{ count: 3n }]);
          throw rollback;
        },
        { timeout: 30_000 },
      ),
    ).rejects.toBe(rollback);
  });
});
