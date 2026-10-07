import { randomUUID } from "node:crypto";
import type { PrismaClientType } from "../index";

const describeIfDb =
  process.env.PATHWAY_RUN_DB_INTEGRATION_TESTS === "1"
    ? describe
    : describe.skip;

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

describeIfDb("ACE fact triggers in the table schema", () => {
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

  it("accepts valid facts and rejects wrong enrollment, tenant, status, origin, and actor", async () => {
    const rollback = new Error("rollback ACE fact trigger probe");
    const schema = `"ace_fact_${randomUUID().replaceAll("-", "")}"`;

    await expect(
      prisma.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(`CREATE SCHEMA ${schema}`);

          const definitions = [
            `CREATE TABLE ${schema}."StudentSubjectEnrollment" (
              "id" text, "tenantId" text, "childId" text,
              "subjectId" text, "status" text)`,
            `CREATE TABLE ${schema}."PaceDiagnosticResult" (
              "id" text, "enrollmentId" text, "tenantId" text,
              "childId" text, "subjectId" text, "recordedAt" timestamp)`,
            `CREATE TABLE ${schema}."Attendance" (
              "id" text, "childId" text, "status" text)`,
            `CREATE TABLE ${schema}."Child" ("id" text, "tenantId" text)`,
            `CREATE TABLE ${schema}."User" ("id" text, "isActive" boolean)`,
            `CREATE TABLE ${schema}."SiteMembership" (
              "tenantId" text, "userId" text)`,
            `CREATE TABLE ${schema}."UserTenantRole" (
              "tenantId" text, "userId" text)`,
            `CREATE TABLE ${schema}."Tenant" ("id" text, "orgId" text)`,
            `CREATE TABLE ${schema}."OrgMembership" (
              "orgId" text, "userId" text)`,
            `CREATE TABLE ${schema}."AttendanceCorrectionEvent" (
              "id" text, "attendanceId" text, "childId" text,
              "tenantId" text, "newStatus" text, "origin" text,
              "correctedByUserId" text, "correctedAt" timestamp)`,
            `CREATE TRIGGER diagnostic_scope BEFORE INSERT ON
              ${schema}."PaceDiagnosticResult" FOR EACH ROW EXECUTE FUNCTION
              app.require_active_pace_diagnostic_enrollment()`,
            `CREATE TRIGGER attendance_scope BEFORE INSERT ON
              ${schema}."AttendanceCorrectionEvent" FOR EACH ROW EXECUTE FUNCTION
              app.require_attendance_correction_scope()`,
          ];
          for (const definition of definitions) {
            await tx.$executeRawUnsafe(definition);
          }

          await tx.$executeRawUnsafe(`
            INSERT INTO ${schema}."StudentSubjectEnrollment" VALUES
              ('active', 'tenant-a', 'child-a', 'subject-a', 'ACTIVE'),
              ('ended', 'tenant-a', 'child-a', 'subject-a', 'ENDED')
          `);
          await tx.$executeRawUnsafe(`
            INSERT INTO ${schema}."PaceDiagnosticResult"
              ("id", "enrollmentId", "tenantId", "childId", "subjectId")
            VALUES ('valid', 'active', 'tenant-a', 'child-a', 'subject-a')
          `);
          await tx.$executeRawUnsafe(`
            DO $probe$
            BEGIN
              BEGIN
                INSERT INTO ${schema}."PaceDiagnosticResult"
                  ("id", "enrollmentId", "tenantId", "childId", "subjectId")
                VALUES ('invalid', 'ended', 'tenant-a', 'child-a', 'subject-a');
                RAISE EXCEPTION 'Inactive enrollment was accepted';
              EXCEPTION WHEN check_violation THEN
                IF SQLERRM <> 'Diagnostic result requires an active subject enrollment'
                THEN RAISE; END IF;
              END;
              BEGIN
                INSERT INTO ${schema}."PaceDiagnosticResult"
                  ("id", "enrollmentId", "tenantId", "childId", "subjectId")
                VALUES ('wrong-tenant', 'active', 'tenant-b', 'child-a', 'subject-a');
                RAISE EXCEPTION 'Cross-tenant diagnostic was accepted';
              EXCEPTION WHEN check_violation THEN
                IF SQLERRM <> 'Diagnostic result requires an active subject enrollment'
                THEN RAISE; END IF;
              END;
            END
            $probe$
          `);

          await tx.$executeRawUnsafe(`
            INSERT INTO ${schema}."Child" VALUES ('child-a', 'tenant-a');
          `);
          await tx.$executeRawUnsafe(`
            INSERT INTO ${schema}."Attendance" VALUES ('attendance-a', 'child-a', 'PRESENT');
          `);
          await tx.$executeRawUnsafe(`
            INSERT INTO ${schema}."User" VALUES ('actor-a', true), ('outsider', true);
          `);
          await tx.$executeRawUnsafe(`
            INSERT INTO ${schema}."SiteMembership" VALUES ('tenant-a', 'actor-a');
          `);
          await tx.$executeRawUnsafe(`
            INSERT INTO ${schema}."AttendanceCorrectionEvent"
              ("id", "attendanceId", "childId", "tenantId", "newStatus",
               "origin", "correctedByUserId")
            VALUES ('valid', 'attendance-a', 'child-a', 'tenant-a', 'PRESENT',
                    'LIVE', 'actor-a')
          `);

          const denied = [
            {
              id: "wrong-status",
              tenant: "tenant-a",
              status: "ABSENT",
              origin: "LIVE",
              actor: "actor-a",
              message:
                "Attendance correction scope or status does not match the attendance row",
            },
            {
              id: "wrong-origin",
              tenant: "tenant-a",
              status: "PRESENT",
              origin: "LEGACY_BACKFILL",
              actor: "actor-a",
              message:
                "Only the migration may recover legacy attendance corrections",
            },
            {
              id: "wrong-actor",
              tenant: "tenant-a",
              status: "PRESENT",
              origin: "LIVE",
              actor: "outsider",
              message:
                "Attendance correction actor is not a member of the site or organisation",
            },
            {
              id: "wrong-tenant",
              tenant: "tenant-b",
              status: "PRESENT",
              origin: "LIVE",
              actor: "actor-a",
              message:
                "Attendance correction scope or status does not match the attendance row",
            },
          ];
          for (const attempt of denied) {
            await tx.$executeRawUnsafe(
              `DO $probe$
               BEGIN
                 BEGIN
                   INSERT INTO ${schema}."AttendanceCorrectionEvent"
                     ("id", "attendanceId", "childId", "tenantId",
                      "newStatus", "origin", "correctedByUserId")
                   VALUES (${sqlLiteral(attempt.id)}, 'attendance-a',
                           'child-a', ${sqlLiteral(attempt.tenant)}, ${sqlLiteral(attempt.status)},
                           ${sqlLiteral(attempt.origin)}, ${sqlLiteral(attempt.actor)});
                   RAISE EXCEPTION 'Invalid attendance event was accepted';
                 EXCEPTION WHEN foreign_key_violation OR check_violation THEN
                   IF SQLERRM <> ${sqlLiteral(attempt.message)} THEN RAISE; END IF;
                 END;
               END
               $probe$`,
            );
          }

          const rows = await tx.$queryRawUnsafe<
            Array<{ diagnosticCount: bigint; attendanceCount: bigint }>
          >(`
            SELECT
              (SELECT count(*) FROM ${schema}."PaceDiagnosticResult") AS "diagnosticCount",
              (SELECT count(*) FROM ${schema}."AttendanceCorrectionEvent") AS "attendanceCount"
          `);
          expect(rows).toEqual([{ diagnosticCount: 1n, attendanceCount: 1n }]);
          throw rollback;
        },
        { timeout: 30_000 },
      ),
    ).rejects.toBe(rollback);
  });
});
