import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;
const KEY_LENGTH_BYTES = 32;
const VERSION_PREFIX = "v1";

let cachedKey: Buffer | null = null;

function loadKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.PII_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "PII_ENCRYPTION_KEY is not set. Generate one with " +
        "`node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"` " +
        "and set it in the environment before encrypting or decrypting PII fields.",
    );
  }

  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_LENGTH_BYTES) {
    throw new Error(
      `PII_ENCRYPTION_KEY must decode to exactly ${KEY_LENGTH_BYTES} bytes (got ${key.length}). ` +
        "It must be a base64-encoded 256-bit key.",
    );
  }

  cachedKey = key;
  return key;
}

/**
 * True if the value is ciphertext produced by encryptField (vs. legacy plaintext
 * written before encryption existed). Used by decryptField to pass legacy rows
 * through untouched during backfill.
 */
export function isEncryptedField(value: string): boolean {
  return value.startsWith(`${VERSION_PREFIX}:`);
}

/**
 * Encrypts a single string field with AES-256-GCM. Output format:
 * "v1:<iv-base64>:<authTag-base64>:<ciphertext-base64>".
 */
export function encryptField(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    VERSION_PREFIX,
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/**
 * Decrypts a value produced by encryptField. Values without the "v1:" prefix
 * are returned unchanged, so legacy plaintext rows remain readable until backfilled.
 */
export function decryptField(value: string): string {
  if (!isEncryptedField(value)) {
    return value;
  }

  const parts = value.split(":");
  if (parts.length !== 4) {
    throw new Error("Malformed encrypted field value");
  }

  const [, ivB64, authTagB64, ciphertextB64] = parts;
  const key = loadKey();
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}
