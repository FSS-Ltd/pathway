import "dotenv/config";
import { prisma } from "@pathway/db";
import { isEncryptedField } from "@pathway/util";

const apply = process.argv.includes("--apply");

type FieldBackfillSpec = {
  /** Prisma delegate name on the `prisma` client, e.g. "child". */
  model: string;
  /** Quoted Postgres table name, e.g. `"Child"`. */
  table: string;
  /** Plain string columns encrypted in place. */
  fields: string[];
  /** Json columns encrypted as a whole `{ __enc }` envelope. */
  jsonFields?: string[];
};

// Keep in sync with ENCRYPTED_STRING_FIELDS / ENCRYPTED_JSON_FIELDS in
// packages/db/src/pii-encryption.ts.
const SPECS: FieldBackfillSpec[] = [
  {
    model: "child",
    table: '"Child"',
    fields: [
      "allergies",
      "additionalNeedsNotes",
      "gpName",
      "gpPhone",
      "specialNeedsOther",
      "notes",
    ],
  },
  {
    model: "childGuardianContact",
    table: '"ChildGuardianContact"',
    fields: ["fullName", "phone", "relationshipToChild"],
  },
  {
    model: "emergencyContact",
    table: '"EmergencyContact"',
    fields: ["name", "phone", "relationship"],
  },
  {
    model: "parentSignupConsent",
    table: '"ParentSignupConsent"',
    fields: ["consentingAdultName", "consentingAdultRelationship"],
  },
  {
    model: "concern",
    table: '"Concern"',
    fields: ["summary", "details"],
  },
  {
    model: "childNote",
    table: '"ChildNote"',
    fields: ["text"],
  },
  {
    model: "pendingOrder",
    table: '"PendingOrder"',
    fields: [],
    jsonFields: ["pendingOrgDetails"],
  },
];

type BackfillResult = { scanned: number; encrypted: number; skipped: number };
type PrismaDelegate = { update: (args: unknown) => Promise<unknown> };

async function main(): Promise<void> {
  console.log(
    `[pii-backfill] mode=${apply ? "apply" : "dry-run"}; pass --apply to encrypt legacy plaintext rows.`,
  );

  const results: Record<string, BackfillResult> = {};
  for (const spec of SPECS) {
    results[spec.model] = await backfillSpec(spec);
  }

  console.log(JSON.stringify(results, null, 2));
}

async function backfillSpec(spec: FieldBackfillSpec): Promise<BackfillResult> {
  const columns = [
    "id",
    ...spec.fields.map((f) => `"${f}"`),
    ...(spec.jsonFields ?? []).map((f) => `"${f}"`),
  ].join(", ");

  // Raw SQL bypasses the pii-encryption Prisma extension, so we see the
  // actual stored bytes (ciphertext or legacy plaintext) instead of the
  // transparently-decrypted value the ORM would normally return.
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT ${columns} FROM ${spec.table}`,
  );

  const result: BackfillResult = { scanned: rows.length, encrypted: 0, skipped: 0 };

  for (const row of rows) {
    const stringUpdates: Record<string, string> = {};
    for (const field of spec.fields) {
      const value = row[field];
      if (typeof value === "string" && value.length > 0 && !isEncryptedField(value)) {
        stringUpdates[field] = value;
      }
    }

    const jsonUpdates: Record<string, unknown> = {};
    for (const field of spec.jsonFields ?? []) {
      const value = row[field];
      if (value !== null && value !== undefined && !isJsonEnvelope(value)) {
        jsonUpdates[field] = value;
      }
    }

    if (Object.keys(stringUpdates).length === 0 && Object.keys(jsonUpdates).length === 0) {
      result.skipped += 1;
      continue;
    }

    if (apply) {
      const delegate = (prisma as unknown as Record<string, PrismaDelegate>)[spec.model];
      // Writing plaintext values back through the ORM re-triggers the
      // pii-encryption extension, which encrypts them on the way out.
      await delegate.update({
        where: { id: row.id },
        data: { ...stringUpdates, ...jsonUpdates },
      });
    }
    result.encrypted += 1;
  }

  return result;
}

function isJsonEnvelope(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.keys(value).length === 1 &&
    typeof (value as Record<string, unknown>).__enc === "string"
  );
}

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
