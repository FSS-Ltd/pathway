import { randomUUID } from "node:crypto";
import type { PrismaClientType } from "../index";

const describeIfDb =
  process.env.PATHWAY_RUN_DB_INTEGRATION_TESTS === "1"
    ? describe
    : describe.skip;

describeIfDb(
  "message participant eligibility in the participant schema",
  () => {
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

    it("enforces guardian, staff, student and tenant scope while allowing removal", async () => {
      const rollback = new Error("rollback message participant probe");
      const schema = `"message_participant_${randomUUID().replaceAll("-", "")}"`;

      await expect(
        prisma.$transaction(
          async (tx) => {
            await tx.$executeRawUnsafe(`CREATE SCHEMA ${schema}`);
            const definitions = [
              `CREATE TABLE ${schema}."MessageConversation" (
              "id" text, "tenantId" text, "kind" text,
              "guardianIdentityId" text)`,
              `CREATE TABLE ${schema}."GuardianIdentity" (
              "id" text, "tenantId" text, "userId" text)`,
              `CREATE TABLE ${schema}."GuardianChildRelationship" (
              "tenantId" text, "guardianIdentityId" text,
              "legalAccess" text, "startsAt" timestamptz,
              "endedAt" timestamptz, "revokedAt" timestamptz)`,
              `CREATE TABLE ${schema}."SiteMembership" (
              "tenantId" text, "userId" text)`,
              `CREATE TABLE ${schema}."StudentIdentity" (
              "tenantId" text, "userId" text)`,
              `CREATE TABLE ${schema}."MessageParticipant" (
              "id" text, "tenantId" text, "conversationId" text,
              "userId" text, "kind" text, "guardianIdentityId" text,
              "joinedAt" timestamptz, "removedAt" timestamptz)`,
              `CREATE TRIGGER participant_scope BEFORE INSERT OR UPDATE
              ON ${schema}."MessageParticipant" FOR EACH ROW
              EXECUTE FUNCTION app.assert_message_participant()`,
            ];
            for (const definition of definitions) {
              await tx.$executeRawUnsafe(definition);
            }
            const fixtures = [
              `INSERT INTO ${schema}."MessageConversation" VALUES
              ('parent', 'tenant-a', 'PARENT_STAFF', 'guardian-a'),
              ('staff', 'tenant-a', 'STAFF_ROOM', NULL),
              ('unlinked-parent', 'tenant-a', 'PARENT_STAFF', 'guardian-unlinked'),
              ('ended-parent', 'tenant-a', 'PARENT_STAFF', 'guardian-ended'),
              ('student-parent', 'tenant-a', 'PARENT_STAFF', 'guardian-student'),
              ('other-tenant', 'tenant-b', 'PARENT_STAFF', 'guardian-b')`,
              `INSERT INTO ${schema}."GuardianIdentity" VALUES
              ('guardian-a', 'tenant-a', 'parent-a'),
              ('guardian-b', 'tenant-b', 'parent-b'),
              ('guardian-unlinked', 'tenant-a', 'parent-unlinked'),
              ('guardian-ended', 'tenant-a', 'parent-ended'),
              ('guardian-student', 'tenant-a', 'student-a')`,
              `INSERT INTO ${schema}."GuardianChildRelationship" VALUES
              ('tenant-a', 'guardian-a', 'FULL',
               now() - interval '1 day', NULL, NULL),
              ('tenant-a', 'guardian-student', 'FULL',
               now() - interval '1 day', NULL, NULL),
              ('tenant-a', 'guardian-unlinked', 'NONE',
               now() - interval '1 day', NULL, NULL),
              ('tenant-a', 'guardian-ended', 'FULL',
               now() - interval '2 days', now() - interval '1 day', NULL)`,
              `INSERT INTO ${schema}."SiteMembership" VALUES
              ('tenant-a', 'staff-a'), ('tenant-a', 'student-a')`,
              `INSERT INTO ${schema}."StudentIdentity" VALUES
              ('tenant-a', 'student-a')`,
            ];
            for (const fixture of fixtures) {
              await tx.$executeRawUnsafe(fixture);
            }
            await tx.$executeRawUnsafe(`
            INSERT INTO ${schema}."MessageParticipant" VALUES
              ('guardian', 'tenant-a', 'parent', 'parent-a',
               'GUARDIAN', 'guardian-a', now(), NULL),
              ('staff', 'tenant-a', 'staff', 'staff-a',
               'STAFF', NULL, now(), NULL),
              ('staff-parent', 'tenant-a', 'parent', 'staff-a',
               'STAFF', NULL, now(), NULL)
          `);
            await tx.$executeRawUnsafe(`
            DO $probe$
            DECLARE
              attempt record;
            BEGIN
              FOR attempt IN
                SELECT * FROM (VALUES
                  ('wrong-tenant', 'tenant-b', 'parent', 'parent-a',
                   'GUARDIAN', 'guardian-a', 'Message conversation does not belong to tenant'),
                  ('wrong-kind', 'tenant-a', 'staff', 'parent-a',
                   'GUARDIAN', 'guardian-a', 'Guardian participants require their parent/staff conversation identity'),
                  ('wrong-guardian', 'tenant-a', 'parent', 'other-user',
                   'GUARDIAN', 'guardian-a', 'Guardian participant identity must match its user and tenant'),
                  ('no-relationship', 'tenant-a', 'unlinked-parent', 'parent-unlinked',
                   'GUARDIAN', 'guardian-unlinked', 'Guardian participants require a current guardian-child relationship'),
                  ('ended-relationship', 'tenant-a', 'ended-parent', 'parent-ended',
                   'GUARDIAN', 'guardian-ended', 'Guardian participants require a current guardian-child relationship'),
                  ('staff-guardian-id', 'tenant-a', 'staff', 'staff-a',
                   'STAFF', 'guardian-a', 'Staff participants cannot carry a guardian identity'),
                  ('staff-no-membership', 'tenant-a', 'staff', 'outsider',
                   'STAFF', NULL, 'Staff participants require a current site membership'),
                  ('student-staff', 'tenant-a', 'staff', 'student-a',
                   'STAFF', NULL, 'Students cannot participate in messaging'),
                  ('student-guardian', 'tenant-a', 'student-parent', 'student-a',
                   'GUARDIAN', 'guardian-student', 'Students cannot participate in messaging')
                ) AS cases(id, tenant_id, conversation_id, user_id,
                           kind, guardian_id, expected_message)
              LOOP
                BEGIN
                  INSERT INTO ${schema}."MessageParticipant" VALUES
                    (attempt.id, attempt.tenant_id, attempt.conversation_id,
                     attempt.user_id, attempt.kind, attempt.guardian_id,
                     now(), NULL);
                  RAISE EXCEPTION 'Invalid participant accepted: %', attempt.id;
                EXCEPTION WHEN foreign_key_violation OR check_violation THEN
                  IF SQLERRM <> attempt.expected_message THEN RAISE; END IF;
                END;
              END LOOP;
            END $probe$
          `);
            await tx.$executeRawUnsafe(`
            DO $probe$ BEGIN
              BEGIN
                UPDATE ${schema}."MessageParticipant"
                SET "userId" = 'other-user' WHERE "id" = 'staff';
                RAISE EXCEPTION 'Participant identity mutation accepted';
              EXCEPTION WHEN object_not_in_prerequisite_state THEN
                IF SQLERRM <> 'Message participant identity is immutable'
                THEN RAISE; END IF;
              END;
            END $probe$
          `);
            await tx.$executeRawUnsafe(`
            DELETE FROM ${schema}."SiteMembership"
            WHERE "userId" = 'staff-a'
          `);
            await tx.$executeRawUnsafe(`
            UPDATE ${schema}."GuardianChildRelationship"
            SET "endedAt" = now() WHERE "guardianIdentityId" = 'guardian-a'
          `);
            await tx.$executeRawUnsafe(`
            UPDATE ${schema}."MessageParticipant"
            SET "removedAt" = now()
            WHERE "id" IN ('guardian', 'staff', 'staff-parent')
          `);
            const rows = await tx.$queryRawUnsafe<
              Array<{ count: bigint; removed: bigint }>
            >(`
            SELECT count(*) AS count,
                   count(*) FILTER (WHERE "removedAt" IS NOT NULL) AS removed
            FROM ${schema}."MessageParticipant"
          `);
            expect(rows).toEqual([{ count: 3n, removed: 3n }]);
            throw rollback;
          },
          { timeout: 30_000 },
        ),
      ).rejects.toBe(rollback);
    });
  },
);
