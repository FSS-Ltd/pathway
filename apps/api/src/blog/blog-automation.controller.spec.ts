import { BadRequestException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { BlogAutomationController } from "./blog-automation.controller";
import { BlogService } from "./blog.service";
import { BlogAutomationTokenService } from "./blog-automation-token.service";
import { BlogAutomationTokenGuard } from "./blog-automation-token.guard";
import type { AutomationRequest } from "./blog-automation-token.guard";

const mockBlogService = () => ({
  createDraft: jest.fn(),
  publish: jest.fn(),
  getAdminById: jest.fn(),
  uploadAsset: jest.fn(),
});

const mockTokenService = () => ({
  recordPublishAudit: jest.fn(),
});

describe("BlogAutomationController", () => {
  let controller: BlogAutomationController;
  let blogService: ReturnType<typeof mockBlogService>;
  let tokenService: ReturnType<typeof mockTokenService>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [BlogAutomationController],
      providers: [
        { provide: BlogService, useFactory: mockBlogService },
        { provide: BlogAutomationTokenService, useFactory: mockTokenService },
      ],
    })
      .overrideGuard(BlogAutomationTokenGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get(BlogAutomationController);
    blogService = moduleRef.get(BlogService);
    tokenService = moduleRef.get(BlogAutomationTokenService);
  });

  it("creates, publishes, audits, and returns response payload", async () => {
    blogService.createDraft.mockResolvedValue({ id: "post_1" });
    blogService.publish.mockResolvedValue({ slug: "my-post", contentHtml: "<p>x</p>" });
    blogService.getAdminById.mockResolvedValue({
      id: "post_1",
      slug: "my-post",
      status: "PUBLISHED",
      publishedAt: new Date("2026-04-08T14:00:00.000Z"),
    });

    const result = await controller.createAndPublishPost(
      {
        title: "My post",
        slug: "my-post",
        contentJson: { type: "doc", content: [] },
      },
      {
        automationToken: { id: "tok_1", name: "cowork" },
      } as unknown as AutomationRequest,
    );

    expect(blogService.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "my-post" }),
    );
    expect(blogService.publish).toHaveBeenCalledWith("post_1", expect.any(String));
    expect(tokenService.recordPublishAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenId: "tok_1",
        tokenName: "cowork",
        blogPostId: "post_1",
        blogSlug: "my-post",
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: "post_1",
        slug: "my-post",
        status: "PUBLISHED",
        url: expect.stringContaining("/blog/my-post"),
      }),
    );
  });

  it("rejects malformed payloads", async () => {
    await expect(
      controller.createAndPublishPost(
        {
          title: "bad",
          slug: "Bad-Slug",
          contentJson: { type: "doc" },
        },
        {} as unknown as AutomationRequest,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("uploads assets via automation endpoint", async () => {
    blogService.uploadAsset.mockResolvedValue({
      id: "asset_1",
      url: "https://nexsteps.dev/media/asset_1",
      width: 1200,
      height: 630,
    });

    const result = await controller.uploadAsset({
      fileBase64: Buffer.from("image-bytes").toString("base64"),
      mimeType: "image/png",
      type: "HEADER",
      width: 1200,
      height: 630,
    });

    expect(blogService.uploadAsset).toHaveBeenCalledWith(
      expect.any(Buffer),
      "image/png",
      "HEADER",
      1200,
      630,
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: "asset_1",
        url: "https://nexsteps.dev/media/asset_1",
      }),
    );
  });

  it("rejects malformed asset payloads", async () => {
    await expect(
      controller.uploadAsset({
        fileBase64: "",
        mimeType: "image/gif",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("supports legacy media upload route for backward compatibility", async () => {
    blogService.uploadAsset.mockResolvedValue({
      id: "asset_legacy",
      url: "https://nexsteps.dev/media/asset_legacy",
      width: 800,
      height: 450,
    });

    const result = await controller.uploadAssetLegacy({
      fileBase64: Buffer.from("legacy-image").toString("base64"),
      mimeType: "image/webp",
      type: "THUMBNAIL",
      width: 800,
      height: 450,
    });

    expect(blogService.uploadAsset).toHaveBeenCalledWith(
      expect.any(Buffer),
      "image/webp",
      "THUMBNAIL",
      800,
      450,
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: "asset_legacy",
        url: "https://nexsteps.dev/media/asset_legacy",
      }),
    );
  });
});
