import {
  Body,
  Controller,
  Post,
  UseGuards,
  BadRequestException,
  Inject,
  Req,
} from "@nestjs/common";
import { BlogService } from "./blog.service";
import { BlogAutomationTokenGuard, type AutomationRequest } from "./blog-automation-token.guard";
import { createAutomationBlogPostDto } from "./dto/create-automation-blog-post.dto";
import { BlogAutomationTokenService } from "./blog-automation-token.service";

@Controller("automation/blog")
@UseGuards(BlogAutomationTokenGuard)
export class BlogAutomationController {
  constructor(
    @Inject(BlogService) private readonly blogService: BlogService,
    @Inject(BlogAutomationTokenService)
    private readonly tokenService: BlogAutomationTokenService,
  ) {}

  @Post("posts")
  async createAndPublishPost(@Body() dto: unknown, @Req() req: AutomationRequest) {
    const parsed = createAutomationBlogPostDto.safeParse(dto);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors);
    }

    const baseUrl = process.env.PUBLIC_BLOG_BASE_URL ?? "https://nexsteps.dev";
    const created = await this.blogService.createDraft(parsed.data);
    await this.blogService.publish(created.id, baseUrl);
    const published = await this.blogService.getAdminById(created.id);

    if (req.automationToken) {
      await this.tokenService.recordPublishAudit({
        tokenId: req.automationToken.id,
        tokenName: req.automationToken.name,
        blogPostId: published.id,
        blogSlug: published.slug,
        publishedAt: published.publishedAt ?? new Date(),
      });
    }

    await this.triggerRevalidation(baseUrl, published.slug);

    return {
      id: published.id,
      slug: published.slug,
      status: published.status,
      publishedAt: published.publishedAt,
      url: `${baseUrl.replace(/\/$/, "")}/blog/${published.slug}`,
    };
  }

  private async triggerRevalidation(webBaseUrl: string, slug: string) {
    const secret = process.env.REVALIDATE_SECRET;
    const webUrl = process.env.WEB_APP_URL ?? webBaseUrl;
    const revalidateUrl = `${webUrl}/api/revalidate`;
    if (!secret) return;

    try {
      await fetch(revalidateUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-revalidate-secret": secret,
        },
        body: JSON.stringify({
          paths: ["/blog", `/blog/${slug}`],
        }),
      });
    } catch {
      // Ignore revalidation network failures; post was already published.
    }
  }
}
