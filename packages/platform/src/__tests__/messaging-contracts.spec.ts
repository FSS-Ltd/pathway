import {
  composeMessageSchema,
  conversationKindSchema,
  inboxRowSchema,
  messageSchema,
  messageCursorSchema,
  recipientSearchResultSchema,
} from "../messaging/contracts";

const id = "d9cbb9fd-f2c5-4fc4-a54b-a03cf1a72835";

describe("shared messaging contracts", () => {
  it("accepts the current web API shapes without tenant or participant identifiers", () => {
    expect(
      inboxRowSchema.safeParse({
        id,
        kind: "PARENT_STAFF",
        title: "School team",
        latestMessage: null,
        updatedAt: "2026-10-11T12:00:00.000Z",
        unreadCount: 0,
      }).success,
    ).toBe(true);
    expect(
      messageSchema.safeParse({
        id,
        sequence: 1,
        body: "Hello",
        createdAt: "2026-10-11T12:00:00.000Z",
        sender: { id, displayName: "School team" },
        deliveryState: null,
        recipientRead: null,
      }).success,
    ).toBe(true);
    expect(messageCursorSchema.safeParse("opaque-history-cursor").success).toBe(
      true,
    );
    expect(messageCursorSchema.safeParse(1).success).toBe(false);
    expect(
      recipientSearchResultSchema.safeParse({ id, displayName: "Teacher" })
        .success,
    ).toBe(true);
  });

  it("rejects student direct messaging, extra identifiers, and blank messages", () => {
    expect(conversationKindSchema.safeParse("STUDENT_DIRECT").success).toBe(
      false,
    );
    expect(
      composeMessageSchema.safeParse({ clientRequestId: id, body: "  " })
        .success,
    ).toBe(false);
    expect(
      recipientSearchResultSchema.safeParse({
        id,
        displayName: "Teacher",
        tenantId: id,
      }).success,
    ).toBe(false);
    expect(
      recipientSearchResultSchema.safeParse({ id, displayName: "  " }).success,
    ).toBe(false);
  });
});
