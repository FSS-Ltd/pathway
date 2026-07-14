import { randomBytes } from "node:crypto";
import { decryptField, encryptField, isEncryptedField } from "../crypto";

const TEST_KEY = randomBytes(32).toString("base64");

beforeAll(() => {
  process.env.PII_ENCRYPTION_KEY = TEST_KEY;
});

describe("encryptField / decryptField", () => {
  it("round-trips a plaintext string", () => {
    const plaintext = "peanut allergy, EpiPen in bag";
    const ciphertext = encryptField(plaintext);

    expect(ciphertext).not.toEqual(plaintext);
    expect(decryptField(ciphertext)).toEqual(plaintext);
  });

  it("round-trips an empty string", () => {
    const ciphertext = encryptField("");
    expect(decryptField(ciphertext)).toEqual("");
  });

  it("produces output tagged with the version prefix", () => {
    const ciphertext = encryptField("some notes");
    expect(ciphertext.startsWith("v1:")).toBe(true);
    expect(ciphertext.split(":")).toHaveLength(4);
    expect(isEncryptedField(ciphertext)).toBe(true);
  });

  it("produces different ciphertext for the same plaintext (random IV)", () => {
    const a = encryptField("repeat me");
    const b = encryptField("repeat me");
    expect(a).not.toEqual(b);
    expect(decryptField(a)).toEqual("repeat me");
    expect(decryptField(b)).toEqual("repeat me");
  });

  it("passes through legacy plaintext values unchanged", () => {
    const legacyPlaintext = "written before encryption existed";
    expect(isEncryptedField(legacyPlaintext)).toBe(false);
    expect(decryptField(legacyPlaintext)).toEqual(legacyPlaintext);
  });

  it("rejects tampered ciphertext (GCM auth tag mismatch)", () => {
    const ciphertext = encryptField("do not tamper with me");
    const [version, iv, tag, body] = ciphertext.split(":");
    const flippedBody =
      body.slice(0, -2) + (body.slice(-2, -1) === "A" ? "B" : "A") + body.slice(-1);
    const tampered = [version, iv, tag, flippedBody].join(":");

    expect(() => decryptField(tampered)).toThrow();
  });

  it("rejects a malformed encrypted value", () => {
    expect(() => decryptField("v1:only-two-parts")).toThrow(
      "Malformed encrypted field value",
    );
  });
});

describe("missing PII_ENCRYPTION_KEY", () => {
  const originalKey = process.env.PII_ENCRYPTION_KEY;

  afterEach(() => {
    process.env.PII_ENCRYPTION_KEY = originalKey;
  });

  it("throws a clear error when encrypting without a configured key", async () => {
    await jest.isolateModulesAsync(async () => {
      delete process.env.PII_ENCRYPTION_KEY;
      const fresh = await import("../crypto");
      expect(() => fresh.encryptField("x")).toThrow(/PII_ENCRYPTION_KEY is not set/);
    });
  });

  it("throws a clear error when the key is the wrong length", async () => {
    await jest.isolateModulesAsync(async () => {
      process.env.PII_ENCRYPTION_KEY = Buffer.from("too-short").toString("base64");
      const fresh = await import("../crypto");
      expect(() => fresh.encryptField("x")).toThrow(/must decode to exactly 32 bytes/);
    });
  });
});
