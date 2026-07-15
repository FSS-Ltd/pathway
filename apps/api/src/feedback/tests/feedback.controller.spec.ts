import { BadRequestException } from "@nestjs/common";
import { FeedbackController } from "../feedback.controller";
import { FeedbackService } from "../feedback.service";

const mockService = () => ({
  create: jest.fn(),
});

describe("FeedbackController", () => {
  let controller: FeedbackController;
  let service: ReturnType<typeof mockService>;

  const tenantId = "33333333-3333-3333-3333-333333333333";
  const orgId = "44444444-4444-4444-4444-444444444444";
  const orgSlug = "acme";
  const userId = "55555555-5555-5555-5555-555555555555";
  const email = "reporter@example.com";
  const displayName = "Reporter Name";

  beforeEach(() => {
    service = mockService();
    controller = new FeedbackController(service as unknown as FeedbackService);
  });

  it("parses a valid body and calls service.create with context", async () => {
    const body = {
      category: "bug",
      subject: "  Broken button  ",
      description: "  It does nothing when clicked  ",
    };
    service.create.mockResolvedValue({ success: true });

    const res = await controller.create(
      body as unknown,
      tenantId,
      orgId,
      orgSlug,
      userId,
      email,
      displayName,
    );

    expect(service.create).toHaveBeenCalledTimes(1);
    const [dto, context] = service.create.mock.calls[0];
    expect(dto).toMatchObject({
      category: "bug",
      subject: "Broken button",
      description: "It does nothing when clicked",
    });
    expect(context).toEqual({
      tenantId,
      orgId,
      orgSlug,
      userId,
      email,
      displayName,
    });
    expect(res).toEqual({ success: true });
  });

  it("rejects an invalid category", async () => {
    const body = {
      category: "not-a-real-category",
      subject: "Subject",
      description: "Description",
    };

    await expect(
      controller.create(
        body as unknown,
        tenantId,
        orgId,
        orgSlug,
        userId,
        email,
        displayName,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.create).not.toHaveBeenCalled();
  });

  it("rejects a missing subject or description", async () => {
    const body = { category: "bug", subject: "", description: "" };

    await expect(
      controller.create(
        body as unknown,
        tenantId,
        orgId,
        orgSlug,
        userId,
        email,
        displayName,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.create).not.toHaveBeenCalled();
  });

  it("rejects a screenshot with no content type", async () => {
    const body = {
      category: "bug",
      subject: "Subject",
      description: "Description",
      screenshotBase64: Buffer.from("fake-image").toString("base64"),
    };

    await expect(
      controller.create(
        body as unknown,
        tenantId,
        orgId,
        orgSlug,
        userId,
        email,
        displayName,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.create).not.toHaveBeenCalled();
  });
});
