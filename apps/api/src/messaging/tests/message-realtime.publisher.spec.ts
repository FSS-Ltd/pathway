import { MessageRealtimePublisher } from "../message-realtime.publisher";

describe("MessageRealtimePublisher", () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalSecret = process.env.SUPABASE_SECRET_KEY;

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalSecret === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = originalSecret;
  });

  it("broadcasts only metadata through a private channel", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-only-secret";
    const send = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = send as typeof fetch;

    await new MessageRealtimePublisher().publishAfterCommit({
      type: "message.created",
      conversationId: "conversation-id",
      messageId: "message-id",
      body: "never broadcast this text",
    } as Parameters<MessageRealtimePublisher["publishAfterCommit"]>[0]);

    expect(send).toHaveBeenCalledWith(
      "https://project.supabase.co/realtime/v1/api/broadcast/ace%3Aconversation%3Aconversation-id/events/message.created?private=true",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          type: "message.created",
          conversationId: "conversation-id",
          messageId: "message-id",
        }),
      }),
    );
    expect(send.mock.calls[0]?.[1]?.body).not.toContain("never broadcast");
  });

  it("does not fail a committed send when realtime is unavailable", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "server-only-secret";
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error("offline")) as typeof fetch;
    await expect(
      new MessageRealtimePublisher().publishAfterCommit({
        type: "conversation.read",
        conversationId: "conversation-id",
        readerScope: "participant",
      }),
    ).resolves.toBeUndefined();
  });
});
