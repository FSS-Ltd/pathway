import { randomUUID } from "node:crypto";
import type { PrismaClientType } from "../index";

const describeIfDb =
  process.env.PATHWAY_RUN_DB_INTEGRATION_TESTS === "1"
    ? describe
    : describe.skip;

describeIfDb("message creator identity in the conversation schema", () => {
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

  it("accepts guardian and staff creators while denying students and wrong tenant scope", async () => {
    const rollback = new Error("rollback message creator probe");
    const schema = `"message_creator_${randomUUID().replaceAll("-", "")}"`;

    await expect(
      prisma.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(`CREATE SCHEMA ${schema}`);
          const definitions = [
            `CREATE TABLE ${schema}."StudentIdentity" (
              "tenantId" text, "userId" text)`,
            `CREATE TABLE ${schema}."GuardianIdentity" (
              "id" text, "tenantId" text, "userId" text)`,
            `CREATE TABLE ${schema}."SiteMembership" (
              "tenantId" text, "userId" text)`,
            `CREATE TABLE ${schema}."MessageConversation" (
              "id" text, "tenantId" text, "createdByUserId" text,
              "kind" text, "guardianIdentityId" text)`,
            `CREATE TRIGGER creator_scope BEFORE INSERT
              ON ${schema}."MessageConversation" FOR EACH ROW
              EXECUTE FUNCTION app.assert_message_conversation_creator()`,
          ];
          for (const definition of definitions) {
            await tx.$executeRawUnsafe(definition);
          }
          const fixtures = [
            `INSERT INTO ${schema}."StudentIdentity" VALUES
              ('tenant-a', 'student-a')`,
            `INSERT INTO ${schema}."GuardianIdentity" VALUES
              ('guardian-id-a', 'tenant-a', 'guardian-a'),
              ('guardian-id-b', 'tenant-b', 'guardian-b')`,
            `INSERT INTO ${schema}."SiteMembership" VALUES
              ('tenant-a', 'staff-a'), ('tenant-a', 'student-a')`,
          ];
          for (const fixture of fixtures) {
            await tx.$executeRawUnsafe(fixture);
          }
          await tx.$executeRawUnsafe(`
            INSERT INTO ${schema}."MessageConversation" VALUES
              ('guardian-parent', 'tenant-a', 'guardian-a',
               'PARENT_STAFF', 'guardian-id-a'),
              ('staff-parent', 'tenant-a', 'staff-a',
               'PARENT_STAFF', 'guardian-id-a'),
              ('staff-direct', 'tenant-a', 'staff-a', 'STAFF_DIRECT', NULL),
              ('staff-room', 'tenant-a', 'staff-a', 'STAFF_ROOM', NULL)
          `);
          await tx.$executeRawUnsafe(`
            DO $probe$
            DECLARE
              attempt record;
            BEGIN
              FOR attempt IN
                SELECT * FROM (VALUES
                  ('student', 'tenant-a', 'student-a', 'PARENT_STAFF',
                   'guardian-id-a', 'Students cannot create messaging conversations'),
                  ('unrelated-guardian', 'tenant-a', 'guardian-b', 'PARENT_STAFF',
                   'guardian-id-a', 'Parent/staff conversations require their guardian or current tenant staff creator'),
                  ('missing-guardian', 'tenant-a', 'guardian-a', 'PARENT_STAFF',
                   'missing', 'Parent/staff conversations require their guardian or current tenant staff creator'),
                  ('wrong-tenant-guardian', 'tenant-a', 'guardian-b', 'PARENT_STAFF',
                   'guardian-id-b', 'Parent/staff conversations require their guardian or current tenant staff creator'),
                  ('guardian-direct', 'tenant-a', 'guardian-a', 'STAFF_DIRECT',
                   NULL, 'Staff conversations require a current tenant staff creator'),
                  ('cross-tenant-staff', 'tenant-b', 'staff-a', 'STAFF_DIRECT',
                   NULL, 'Staff conversations require a current tenant staff creator')
                ) AS cases(id, tenant_id, actor_id, kind, guardian_id,
                           expected_message)
              LOOP
                BEGIN
                  INSERT INTO ${schema}."MessageConversation"
                  VALUES (attempt.id, attempt.tenant_id, attempt.actor_id,
                          attempt.kind, attempt.guardian_id);
                  RAISE EXCEPTION 'Invalid creator accepted: %', attempt.id;
                EXCEPTION WHEN check_violation THEN
                  IF SQLERRM <> attempt.expected_message THEN RAISE; END IF;
                END;
              END LOOP;
            END $probe$
          `);

          const rows = await tx.$queryRawUnsafe<Array<{ count: bigint }>>(`
            SELECT count(*) AS count FROM ${schema}."MessageConversation"
          `);
          expect(rows).toEqual([{ count: 4n }]);
          throw rollback;
        },
        { timeout: 30_000 },
      ),
    ).rejects.toBe(rollback);
  });
});
