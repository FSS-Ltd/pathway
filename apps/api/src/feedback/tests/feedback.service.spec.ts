import { BadRequestException } from "@nestjs/common";
import { FeedbackService } from "../feedback.service";
import { MailerService } from "../../mailer/mailer.service";

const mockMailer = () => ({
  sendFeedbackEmail: jest.fn().mockResolvedValue(undefined),
});

describe("FeedbackService", () => {
  let service: FeedbackService;
  let mailer: ReturnType<typeof mockMailer>;

  const baseContext = {
    tenantId: "33333333-3333-3333-3333-333333333333",
    orgId: "44444444-4444-4444-4444-444444444444",
    orgSlug: "acme",
    userId: "55555555-5555-5555-5555-555555555555",
    email: "reporter@example.com",
    displayName: "Reporter Name",
  };

  beforeEach(() => {
    mailer = mockMailer();
    service = new FeedbackService(mailer as unknown as MailerService);
  });

  it("sends feedback with no attachment when no screenshot is provided", async () => {
    const res = await service.create(
      {
        category: "bug",
        subject: "Broken button",
        description: "It does nothing when clicked",
      },
      baseContext,
    );

    expect(res).toEqual({ success: true });
    expect(mailer.sendFeedbackEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "bug",
        subject: "Broken button",
        description: "It does nothing when clicked",
        attachment: undefined,
      }),
    );
  });

  it("decodes a valid screenshot and attaches it to the email", async () => {
    const base64 = Buffer.from("fake-image-bytes").toString("base64");

    await service.create(
      {
        category: "feature-request",
        subject: "Add dark mode",
        description: "Please add dark mode",
        screenshotBase64: base64,
        screenshotContentType: "image/png",
        screenshotFilename: "error.png",
      },
      baseContext,
    );

    expect(mailer.sendFeedbackEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        attachment: {
          buffer: Buffer.from(base64, "base64"),
          filename: "error.png",
          contentType: "image/png",
        },
      }),
    );
  });

  it("throws BadRequestException for an oversized screenshot without calling the mailer", async () => {
    const oversized = Buffer.alloc(6 * 1024 * 1024).toString("base64"); // 6MB > 5MB limit

    await expect(
      service.create(
        {
          category: "bug",
          subject: "Subject",
          description: "Description",
          screenshotBase64: oversized,
          screenshotContentType: "image/png",
        },
        baseContext,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mailer.sendFeedbackEmail).not.toHaveBeenCalled();
  });

  it("propagates a mailer failure instead of swallowing it", async () => {
    mailer.sendFeedbackEmail.mockRejectedValue(new Error("Resend is down"));

    await expect(
      service.create(
        { category: "other", subject: "Subject", description: "Description" },
        baseContext,
      ),
    ).rejects.toThrow("Resend is down");
  });

  it("succeeds even when tenant/org context is empty (no active site)", async () => {
    const res = await service.create(
      { category: "bug", subject: "Subject", description: "Description" },
      { ...baseContext, tenantId: "", orgId: "", orgSlug: undefined },
    );

    expect(res).toEqual({ success: true });
    expect(mailer.sendFeedbackEmail).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: undefined, orgId: undefined, orgSlug: undefined }),
    );
  });
});
