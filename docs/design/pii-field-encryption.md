# PII field encryption (sensitive subset)

## Problem statement

Child and guardian PII — allergies, SEND/medical notes, safeguarding concerns, guardian
contact details — was stored in plaintext Postgres columns. No field-level encryption,
KMS, or key existed anywhere in the codebase. `PendingOrder.pendingOrgDetails` could also
carry a plaintext password transiently during buy-now checkout.

## Architecture approach and key decisions

- **Scope: sensitive content fields only, not lookup/identity fields.** Encrypting
  `User.email`, `ChildGuardianContact.email`, or name fields used for search/uniqueness
  would require a blind-index strategy (deterministic hash column for equality lookups)
  and touches Auth0 linkage — a much larger, separate effort. This pass encrypts only
  fields that are never used in `where`/`orderBy`/unique constraints.
- **Mechanism: a Prisma Client Extension (`$extends`), not per-service encrypt/decrypt
  calls.** Applied once at the single DB bootstrap chokepoint
  (`packages/db/src/index.ts`), it is transparent to every service — no service file
  needed to change.
- **Algorithm: AES-256-GCM**, authenticated encryption (tamper-evident), via Node's
  built-in `node:crypto` — no new runtime dependency. Implemented in
  `packages/util/src/crypto.ts` (`encryptField` / `decryptField`).
- **Ciphertext format:** `v1:<iv-b64>:<authTag-b64>:<ciphertext-b64>`. The `v1:` prefix
  is a version marker and doubles as the "is this encrypted?" test
  (`isEncryptedField`), which lets legacy plaintext rows written before this change pass
  through `decryptField` unchanged — no flag day, no forced migration required before
  deploy.
- **Read-side decryption is generic, not per-field.** Rather than maintain a
  read-side field registry (which would need to know about every relation shape a query
  might return), `decryptDeep` walks the entire result tree and decrypts any string
  matching the ciphertext shape, and unwraps `{ __enc }` JSON envelopes. This is safe
  because the `v1:` prefix is specific enough that a coincidental match is
  astronomically unlikely, and a failed decrypt (tamper/corruption) is caught and the
  original value returned rather than crashing the read. Non-plain-object values (Date,
  Buffer, Prisma Decimal) are explicitly passed through untouched.
- **Write-side encryption is registry-driven** (`ENCRYPTED_STRING_FIELDS` /
  `ENCRYPTED_JSON_FIELDS` in `packages/db/src/pii-encryption.ts`), because writes must
  know exactly which columns to transform.
- **Known limitation:** only top-level `data`/`create`/`update` args are intercepted.
  Nested relation writes (`data: { guardianContacts: { create: [...] } } }`) are not
  auto-encrypted. Verified against current usage — every write path that touches a
  registered model issues a separate top-level Prisma call per model (see
  `public-signup.service.ts`) — so this is not a gap today. Flag if a future write path
  introduces nested writes for a registered model.
- **`Child.dateOfBirth` is explicitly NOT encrypted in this pass.** It's a `DateTime`
  column; encrypting it would require a type change to `String` and moving age-based
  logic (session eligibility, group assignment) into the application layer. Tracked as a
  deliberate follow-up, not an oversight.

## Fields encrypted

| Model | Fields |
|---|---|
| `Child` | `allergies`, `additionalNeedsNotes`, `gpName`, `gpPhone`, `specialNeedsOther`, `notes` |
| `ChildGuardianContact` | `fullName`, `phone`, `relationshipToChild` |
| `EmergencyContact` | `name`, `phone`, `relationship` |
| `ParentSignupConsent` | `consentingAdultName`, `consentingAdultRelationship` |
| `Concern` | `summary`, `details` |
| `ChildNote` | `text` |
| `PendingOrder` | `pendingOrgDetails` (whole JSON blob, `{ __enc }` envelope) |

Explicitly excluded: `User.email`, `ChildGuardianContact.email`, all name fields used
for lookup/display/uniqueness, `Child.dateOfBirth`, binary photo/avatar blobs (already
isolated in a private Supabase bucket).

## Data model

No schema/column type changes — ciphertext is stored in the same `String`/`String?`/
`Json?` columns, just longer. Schema comments were added next to each affected model
pointing at `packages/db/src/pii-encryption.ts` as the source of truth for what's
encrypted.

## Failure modes and resilience

- **Missing/invalid key:** `encryptField`/`decryptField` throw a descriptive error
  immediately (`PII_ENCRYPTION_KEY is not set` / wrong length) rather than silently
  writing plaintext or corrupting data.
- **Tampered/corrupted ciphertext:** GCM's auth tag causes `decryptField` to throw;
  `decryptDeep` catches this per-value and returns the original (still-encrypted)
  string rather than failing the whole read, so a single bad row doesn't take down a
  list endpoint.
- **Legacy plaintext rows:** pass through both encrypt (only encrypts non-ciphertext
  values) and decrypt (no-op on non-`v1:` strings) — safe to deploy before running the
  backfill, and safe to re-run the backfill any number of times.
- **Key rotation:** the `v1:` prefix reserves room for a future `v2` scheme; rotation is
  "backfill under the new key" (re-running `pii:backfill --apply` after swapping
  `PII_ENCRYPTION_KEY` and temporarily supporting both keys for decrypt — not built in
  this pass, since no rotation has been requested yet).

## Security and privacy

- Key lives only in environment configuration (`PII_ENCRYPTION_KEY`, base64 32 bytes),
  never in code or version control. `.env`/`.env.prod` are gitignored; `.env.test`
  carries a test-only key consistent with the other test fixture secrets already
  committed there.
- Production key must be generated and stored in the real secrets manager (Vercel env)
  before this ships to production — **not done automatically by this change**; a
  `.env.prod` placeholder with a TODO was left instead of guessing/generating a live key.
- DSAR export (`apps/api/src/dsar/dsar.service.ts`) reads through the same Prisma
  client, so exports continue to return decrypted plaintext as required for subject
  access requests.

## Rollout and rollback plan

1. Set `PII_ENCRYPTION_KEY` in every environment (dev/test/staging/prod) before or
   at deploy — writes will throw without it, so this is fail-closed, not fail-open.
2. Deploy. New/updated rows encrypt automatically; existing rows remain readable
   plaintext (no read-path disruption).
3. Run `pnpm --filter @pathway/api pii:backfill` (dry run) to see counts, then
   `-- --apply` to encrypt existing rows in place, per model.
4. Rollback: safe to revert the code deploy at any point — plaintext rows are
   unaffected either way, and rows already encrypted remain decryptable as long as the
   key is retained (reverting code does not delete the key).

## Success metrics

- `pii:backfill` dry run reports 0 unencrypted rows remaining after `--apply`.
- No production error-rate increase on read/write paths touching the six registered
  models after rollout.
