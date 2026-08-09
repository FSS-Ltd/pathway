import {
  isPrivateStorageKey,
  messageAttachmentKey,
  noticeAttachmentKey,
} from "./storage-key.util";

describe("ACE private storage keys", () => {
  it("namespaces message and notice attachments under their tenant", () => {
    expect(messageAttachmentKey("tenant-1", "message-1", "photo.png")).toBe(
      "tenants/tenant-1/messages/message-1/photo.png",
    );
    expect(noticeAttachmentKey("tenant-1", "notice-1", "memo.pdf")).toBe(
      "tenants/tenant-1/notices/notice-1/memo.pdf",
    );
  });

  it("accepts only registered private storage classes", () => {
    expect(
      isPrivateStorageKey("tenants/tenant-1/messages/message-1/photo.png"),
    ).toBe(true);
    expect(isPrivateStorageKey("blog/assets/public.png")).toBe(false);
  });
});
