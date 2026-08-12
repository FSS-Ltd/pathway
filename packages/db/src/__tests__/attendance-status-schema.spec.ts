import { readFileSync } from "node:fs";
import path from "node:path";

const schema = readFileSync(
  path.resolve(process.cwd(), "prisma/schema.prisma"),
  "utf8",
);

const migration = readFileSync(
  path.resolve(
    process.cwd(),
    "prisma/migrations/20260812190000_attendance_status_expand/migration.sql",
  ),
  "utf8",
);

describe("attendance status expand schema contract", () => {
  it("adds Late without removing the legacy Boolean", () => {
    expect(schema).toMatch(
      /enum AttendanceStatus\s*{\s*PRESENT\s*ABSENT\s*LATE\s*}/,
    );
    expect(schema).toMatch(
      /model Attendance[\s\S]*present\s+Boolean[\s\S]*status\s+AttendanceStatus/,
    );
    expect(migration).toContain(
      "CREATE TYPE \"AttendanceStatus\" AS ENUM ('PRESENT', 'ABSENT', 'LATE')",
    );
    expect(migration).not.toMatch(/DROP\s+(COLUMN|TABLE|TYPE)/i);
  });

  it("backfills deterministically before requiring status", () => {
    const backfillPosition = migration.indexOf('UPDATE "Attendance"');
    const notNullPosition = migration.indexOf(
      'ALTER COLUMN "status" SET NOT NULL',
    );

    expect(backfillPosition).toBeGreaterThan(-1);
    expect(notNullPosition).toBeGreaterThan(backfillPosition);
    expect(migration).toContain(
      "WHEN \"present\" THEN 'PRESENT'::\"AttendanceStatus\"",
    );
    expect(migration).toContain("ELSE 'ABSENT'::\"AttendanceStatus\"");
    expect(migration).toContain('WHERE "status" IS NULL');
  });

  it("keeps new status and legacy present writes coherent during expand", () => {
    expect(migration).toContain("app.sync_attendance_status_expand()");
    expect(migration).toContain(
      "NEW.\"present\" := NEW.\"status\" <> 'ABSENT'::\"AttendanceStatus\"",
    );
    expect(migration).toContain(
      'ELSIF NEW."present" IS DISTINCT FROM OLD."present" THEN',
    );
    expect(migration).toContain(
      'BEFORE INSERT OR UPDATE OF "present", "status" ON "Attendance"',
    );
  });

  it("stores complete correction provenance with supporting indexes", () => {
    expect(schema).toMatch(
      /correctedByUser\s+User\?[\s\S]*onDelete: Restrict/,
    );
    expect(migration).toContain(
      'CONSTRAINT "Attendance_correction_metadata_check"',
    );
    expect(migration).toContain('btrim("correctionReason") <> \'\'');
    expect(migration).toContain(
      'CREATE INDEX "Attendance_sessionId_status_idx"',
    );
    expect(migration).toContain(
      'CREATE INDEX "Attendance_correctedByUserId_correctedAt_idx"',
    );
  });

  it("continues to force tenant RLS on Attendance", () => {
    expect(migration).toContain(
      'ALTER TABLE "Attendance" ENABLE ROW LEVEL SECURITY',
    );
    expect(migration).toContain(
      'ALTER TABLE "Attendance" FORCE ROW LEVEL SECURITY',
    );
  });
});
