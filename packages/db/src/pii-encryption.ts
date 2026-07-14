import { decryptField, encryptField, isEncryptedField } from "@pathway/util";
import type { PrismaClient } from "@prisma/client";

/**
 * Prisma model name (as used in $allOperations' `model` arg, PascalCase) -> the
 * plain string fields on that model that hold sensitive PII content and must be
 * encrypted at rest. Only content fields are listed here — lookup/identity fields
 * (User.email, ChildGuardianContact.email, names used for search/joins) are
 * intentionally excluded; encrypting those would require a blind-index strategy,
 * which is out of scope for this pass.
 */
const ENCRYPTED_STRING_FIELDS: Record<string, readonly string[]> = {
  Child: [
    "allergies",
    "additionalNeedsNotes",
    "gpName",
    "gpPhone",
    "specialNeedsOther",
    "notes",
  ],
  ChildGuardianContact: ["fullName", "phone", "relationshipToChild"],
  EmergencyContact: ["name", "phone", "relationship"],
  ParentSignupConsent: [
    "consentingAdultName",
    "consentingAdultRelationship",
  ],
  Concern: ["summary", "details"],
  ChildNote: ["text"],
};

/**
 * Json fields that must be encrypted as a whole (the column stays type Json,
 * but its value is replaced with a single-key `{ __enc }` ciphertext wrapper).
 * PendingOrder.pendingOrgDetails can carry a plaintext password transiently
 * during the buy-now checkout flow.
 */
const ENCRYPTED_JSON_FIELDS: Record<string, readonly string[]> = {
  PendingOrder: ["pendingOrgDetails"],
};

type JsonEnvelope = { __enc: string };

function isJsonEnvelope(value: unknown): value is JsonEnvelope {
  return (
    isPlainObject(value) &&
    Object.keys(value).length === 1 &&
    typeof value.__enc === "string"
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function encryptDataObject(
  model: string,
  data: unknown,
): unknown {
  if (!isPlainObject(data)) return data;

  const stringFields = ENCRYPTED_STRING_FIELDS[model];
  const jsonFields = ENCRYPTED_JSON_FIELDS[model];
  if (!stringFields && !jsonFields) return data;

  const next: Record<string, unknown> = { ...data };

  for (const field of stringFields ?? []) {
    const value = next[field];
    if (typeof value === "string" && value.length > 0 && !isEncryptedField(value)) {
      next[field] = encryptField(value);
    }
  }

  for (const field of jsonFields ?? []) {
    const value = next[field];
    if (value !== null && value !== undefined && !isJsonEnvelope(value)) {
      next[field] = { __enc: encryptField(JSON.stringify(value)) } satisfies JsonEnvelope;
    }
  }

  return next;
}

/** Recursively decrypts any ciphertext strings/JSON envelopes found in a query result. */
function decryptDeep<T>(value: T): T {
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    if (!isEncryptedField(value)) return value;
    try {
      return decryptField(value) as unknown as T;
    } catch {
      // Not actually one of ours (or corrupted) — leave untouched rather than crash a read.
      return value;
    }
  }

  if (Array.isArray(value)) {
    return value.map((item) => decryptDeep(item)) as unknown as T;
  }

  if (isPlainObject(value)) {
    if (isJsonEnvelope(value)) {
      try {
        return JSON.parse(decryptField(value.__enc)) as T;
      } catch {
        return value as T;
      }
    }
    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      next[key] = decryptDeep(item);
    }
    return next as T;
  }

  // Date, Buffer, Decimal, and other non-plain-object instances pass through untouched.
  return value;
}

/**
 * Wraps a PrismaClient with transparent field-level encryption for the models
 * registered in ENCRYPTED_STRING_FIELDS / ENCRYPTED_JSON_FIELDS.
 *
 * Encryption is applied to top-level `data`/`create`/`update` args only — nested
 * relation writes (e.g. `data: { guardianContacts: { create: [...] } } }`) are not
 * intercepted. The codebase's current write paths always issue a separate
 * top-level call per model (see public-signup.service.ts), so this is not a gap
 * today; keep it in mind if a future write path introduces nested relation writes
 * for a registered model.
 */
export function withPiiEncryption<T extends PrismaClient>(client: T): T {
  return client.$extends({
    name: "pii-field-encryption",
    query: {
      $allModels: {
        async $allOperations({ model, args, query }) {
          if (model && ENCRYPTED_STRING_FIELDS[model]) {
            args = encryptWriteArgs(model, args as Record<string, unknown>);
          }
          if (model && ENCRYPTED_JSON_FIELDS[model]) {
            args = encryptWriteArgs(model, args as Record<string, unknown>);
          }

          const result = await query(args);
          return decryptDeep(result);
        },
      },
    },
  }) as unknown as T;
}

function encryptWriteArgs(
  model: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...args };

  if (Array.isArray(next.data)) {
    next.data = next.data.map((row) => encryptDataObject(model, row));
  } else if (next.data !== undefined) {
    next.data = encryptDataObject(model, next.data);
  }

  // upsert
  if (next.create !== undefined) {
    next.create = encryptDataObject(model, next.create);
  }
  if (next.update !== undefined) {
    next.update = encryptDataObject(model, next.update);
  }

  return next;
}
