import { randomBytes } from "node:crypto";
import { encryptField, isEncryptedField } from "@pathway/util";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  withPiiEncryption,
  withPiiEncryptionTransaction,
} from "../pii-encryption";

type AllOperationsHandler = (params: {
  model?: string;
  operation: string;
  args: unknown;
  query: (args: unknown) => unknown;
}) => Promise<unknown>;

/**
 * Minimal stand-in for a PrismaClient that only implements the shape
 * withPiiEncryption actually touches: `$extends({ query: { $allModels: { $allOperations } } })`.
 * `invoke` lets tests call the captured handler exactly the way Prisma's query
 * engine would, without needing a real database.
 */
function makeFakeClient() {
  let captured: AllOperationsHandler | undefined;
  const fakeClient = {
    $extends(config: {
      query: { $allModels: { $allOperations: AllOperationsHandler } };
    }) {
      captured = config.query.$allModels.$allOperations;
      return fakeClient;
    },
  };

  return {
    fakeClient: fakeClient as unknown as PrismaClient,
    invoke: async (
      model: string,
      operation: string,
      args: unknown,
      dbFn: (args: unknown) => unknown,
    ) => {
      if (!captured) throw new Error("withPiiEncryption was not applied yet");
      return captured({ model, operation, args, query: dbFn });
    },
  };
}

beforeAll(() => {
  process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

describe("withPiiEncryption", () => {
  it("encrypts registered string fields on write and decrypts them back on read", async () => {
    const { fakeClient, invoke } = makeFakeClient();
    withPiiEncryption(fakeClient);

    let capturedArgs: { data: Record<string, unknown> } | undefined;
    const result = (await invoke(
      "Child",
      "create",
      { data: { firstName: "Ada", allergies: "peanuts", notes: "loves painting" } },
      (args) => {
        capturedArgs = args as typeof capturedArgs;
        return { id: "c1", ...(args as { data: Record<string, unknown> }).data };
      },
    )) as Record<string, unknown>;

    // firstName is not a registered field — sent to the DB layer untouched.
    expect(capturedArgs?.data.firstName).toBe("Ada");
    // allergies/notes are registered — must never hit the query layer as plaintext.
    expect(isEncryptedField(capturedArgs?.data.allergies as string)).toBe(true);
    expect(isEncryptedField(capturedArgs?.data.notes as string)).toBe(true);

    // The caller-facing result is transparently decrypted back to plaintext.
    expect(result).toEqual({
      id: "c1",
      firstName: "Ada",
      allergies: "peanuts",
      notes: "loves painting",
    });
  });

  it("leaves models with no registered fields untouched", async () => {
    const { fakeClient, invoke } = makeFakeClient();
    withPiiEncryption(fakeClient);

    const result = await invoke(
      "Org",
      "create",
      { data: { name: "Acme Youth Club" } },
      (args) => ({ id: "o1", ...(args as { data: Record<string, unknown> }).data }),
    );

    expect(result).toEqual({ id: "o1", name: "Acme Youth Club" });
  });

  it("decrypts every row in an array result (findMany)", async () => {
    const { fakeClient, invoke } = makeFakeClient();
    withPiiEncryption(fakeClient);

    const storedRows = [
      { id: "c1", allergies: encryptField("nuts") },
      { id: "c2", allergies: encryptField("none") },
    ];
    const result = await invoke("Child", "findMany", {}, () => storedRows);

    expect(result).toEqual([
      { id: "c1", allergies: "nuts" },
      { id: "c2", allergies: "none" },
    ]);
  });

  it("encrypts the PendingOrder.pendingOrgDetails JSON blob so plaintext never reaches the query layer", async () => {
    const { fakeClient, invoke } = makeFakeClient();
    withPiiEncryption(fakeClient);

    const details = { orgName: "Acme", contactEmail: "a@b.com", password: "hunter2" };
    let capturedArgs: { data: Record<string, unknown> } | undefined;

    const result = (await invoke(
      "PendingOrder",
      "create",
      { data: { planCode: "trial", pendingOrgDetails: details } },
      (args) => {
        capturedArgs = args as typeof capturedArgs;
        return { id: "po1", ...(args as { data: Record<string, unknown> }).data };
      },
    )) as Record<string, unknown>;

    expect(JSON.stringify(capturedArgs?.data.pendingOrgDetails)).not.toContain("hunter2");
    expect(result.pendingOrgDetails).toEqual(details);
  });

  it("does not mangle Date instances in results", async () => {
    const { fakeClient, invoke } = makeFakeClient();
    withPiiEncryption(fakeClient);

    const dob = new Date("2015-06-01T00:00:00.000Z");
    const result = (await invoke("Child", "findFirst", {}, () => ({
      id: "c1",
      dateOfBirth: dob,
    }))) as { dateOfBirth: Date };

    expect(result.dateOfBirth).toBeInstanceOf(Date);
    expect(result.dateOfBirth.toISOString()).toBe(dob.toISOString());
  });

  it("passes through legacy plaintext rows written before encryption existed", async () => {
    const { fakeClient, invoke } = makeFakeClient();
    withPiiEncryption(fakeClient);

    const result = await invoke("Child", "findFirst", {}, () => ({
      id: "c1",
      allergies: "unknown",
    }));

    expect(result).toEqual({ id: "c1", allergies: "unknown" });
  });

  it("does not double-encrypt a value that is already ciphertext", async () => {
    const { fakeClient, invoke } = makeFakeClient();
    withPiiEncryption(fakeClient);

    const already = encryptField("nuts");
    let capturedArgs: { data: Record<string, unknown> } | undefined;

    await invoke(
      "Child",
      "update",
      { data: { allergies: already } },
      (args) => {
        capturedArgs = args as typeof capturedArgs;
        return { id: "c1", ...(args as { data: Record<string, unknown> }).data };
      },
    );

    expect(capturedArgs?.data.allergies).toBe(already);
  });
});

describe("withPiiEncryptionTransaction", () => {
  it("encrypts writes and decrypts reads issued by a transaction delegate", async () => {
    let storedText = "";
    const childNote = {
      async create(args: { data: { text: string } }) {
        storedText = args.data.text;
        return { id: "note-1", text: storedText };
      },
      async findUnique() {
        return { id: "note-1", text: storedText };
      },
    };
    const transaction = {
      childNote,
    } as unknown as Prisma.TransactionClient;
    const encryptedTransaction = withPiiEncryptionTransaction(transaction) as unknown as {
      childNote: typeof childNote;
    };

    const created = await encryptedTransaction.childNote.create({
      data: { text: "Private note" },
    });
    const read = await encryptedTransaction.childNote.findUnique();

    expect(isEncryptedField(storedText)).toBe(true);
    expect(created.text).toBe("Private note");
    expect(read.text).toBe("Private note");
  });
});
