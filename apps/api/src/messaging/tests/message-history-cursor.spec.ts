import {
  decodeMessageHistoryCursor,
  encodeMessageHistoryCursor,
} from "../message-history-cursor";

const tenantId = "04a6fc31-d4ec-4e4d-8c33-847f04256849";
const userId = "ab07ace0-5ad2-490e-ae46-7e7bd66215ce";
const conversationId = "c4081512-e02b-43c2-a015-342b9743e6c4";

describe("message history cursor", () => {
  it("round trips a sequence without exposing site, user or conversation IDs", () => {
    const cursor = encodeMessageHistoryCursor(
      42,
      tenantId,
      userId,
      conversationId,
    );
    const payload = Buffer.from(cursor, "base64url").toString("utf8");
    expect(payload).not.toContain(tenantId);
    expect(payload).not.toContain(userId);
    expect(payload).not.toContain(conversationId);
    expect(
      decodeMessageHistoryCursor(cursor, tenantId, userId, conversationId),
    ).toBe(42);
  });

  it("rejects another site, viewer, conversation, or malformed sequence", () => {
    const cursor = encodeMessageHistoryCursor(
      42,
      tenantId,
      userId,
      conversationId,
    );
    for (const [site, user, conversation] of [
      ["other-site", userId, conversationId],
      [tenantId, "other-user", conversationId],
      [tenantId, userId, "other-conversation"],
    ] as const) {
      expect(() =>
        decodeMessageHistoryCursor(cursor, site, user, conversation),
      ).toThrow();
    }
    const malformed = Buffer.from(
      JSON.stringify({ sequence: 0, scope: "anything" }),
    ).toString("base64url");
    expect(() =>
      decodeMessageHistoryCursor(malformed, tenantId, userId, conversationId),
    ).toThrow();
  });
});
