import {
  Controller,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Get,
  Query,
  UseGuards,
  Req,
  BadRequestException,
  ForbiddenException,
  Inject,
} from "@nestjs/common";
import { prisma } from "@pathway/db";
import { uploadAssetDto } from "./dto/upload-asset.dto";
import type { Request } from "express";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { BlogService } from "./blog.service";
import { createBlogPostDto } from "./dto/create-blog-post.dto";
import { updateBlogPostDto } from "./dto/update-blog-post.dto";
import { BlogAutomationTokenService } from "./blog-automation-token.service";
import { createAutomationTokenDto } from "./dto/create-automation-token.dto";
interface AuthRequest extends Request {
  authUserId?: string;
  __pathwayContext?: {
    roles?: { org: string[]; tenant: string[] };
    org?: { orgId?: string };
    tenant?: { tenantId?: string };
    user?: { userId?: string };
  };
}

@Controller("admin/blog")
@UseGuards(AuthUserGuard)
export class BlogAdminController {
  constructor(
    @Inject(BlogService) private readonly blogService: BlogService,
    @Inject(BlogAutomationTokenService)
    private readonly automationTokenService: BlogAutomationTokenService,
  ) {}

  private async assertBlogAdmin(req: AuthRequest) {
    const userId = req.authUserId;
    if (!userId) {
      throw new ForbiddenException("Authentication required");
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { superUser: true },
    });
    if (!user?.superUser) {
      throw new ForbiddenException("Blog access is restricted to Nexsteps staff only");
    }
  }

  @Post("posts")
  async createPost(@Body() dto: unknown, @Req() req: AuthRequest) {
    await this.assertBlogAdmin(req);
    const parsed = createBlogPostDto.safeParse(dto);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors);
    }
    return this.blogService.createDraft(parsed.data);
  }

  @Put("posts/:id")
  async updatePost(
    @Param("id") id: string,
    @Body() dto: unknown,
    @Req() req: AuthRequest,
  ) {
    await this.assertBlogAdmin(req);
    const parsed = updateBlogPostDto.safeParse(dto);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors);
    }
    return this.blogService.updateDraft(id, parsed.data);
  }

  @Post("posts/:id/publish")
  async publishPost(
    @Param("id") id: string,
    @Body() body: { scheduledAt?: string } | undefined,
    @Req() req: AuthRequest,
  ) {
    await this.assertBlogAdmin(req);
    const baseUrl = process.env.PUBLIC_BLOG_BASE_URL ?? "https://nexsteps.dev";
    let result: { contentHtml: string; slug: string };
    if (body?.scheduledAt) {
      const scheduledAt = new Date(body.scheduledAt);
      result = await this.blogService.schedule(id, baseUrl, scheduledAt, req.authUserId);
    } else {
      result = await this.blogService.publish(id, baseUrl, req.authUserId);
    }
    await this.triggerRevalidation(baseUrl, result.slug);
    return result;
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
    } catch (err) {
      console.warn("[BlogAdmin] Revalidation request failed:", err);
    }
  }

  @Get("posts")
  async listPosts(
    @Req() req: AuthRequest,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    await this.assertBlogAdmin(req);
    const l = limit ? Math.min(50, Math.max(1, parseInt(limit, 10))) : 50;
    return this.blogService.listAdmin(l, cursor);
  }

  @Get("posts/:id")
  async getPost(@Param("id") id: string, @Req() req: AuthRequest) {
    await this.assertBlogAdmin(req);
    return this.blogService.getAdminById(id);
  }

  @Delete("posts/:id")
  async deletePost(@Param("id") id: string, @Req() req: AuthRequest) {
    await this.assertBlogAdmin(req);
    const result = await this.blogService.delete(id);
    const baseUrl = process.env.PUBLIC_BLOG_BASE_URL ?? "https://nexsteps.dev";
    await this.triggerRevalidation(baseUrl, result.slug);
    return result;
  }

  @Post("assets")
  async uploadAsset(@Body() dto: unknown, @Req() req: AuthRequest) {
    await this.assertBlogAdmin(req);
    const parsed = uploadAssetDto.safeParse(dto);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors);
    }
    const buffer = Buffer.from(parsed.data.fileBase64, "base64");
    return this.blogService.uploadAsset(
      buffer,
      parsed.data.mimeType,
      parsed.data.type,
      parsed.data.width,
      parsed.data.height,
    );
  }

  @Post("automation/tokens")
  async createAutomationToken(@Body() dto: unknown, @Req() req: AuthRequest) {
    await this.assertBlogAdmin(req);
    const parsed = createAutomationTokenDto.safeParse(dto);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors);
    }
    return this.automationTokenService.createToken(parsed.data);
  }

  @Delete("automation/tokens/:id")
  async revokeAutomationToken(@Param("id") id: string, @Req() req: AuthRequest) {
    await this.assertBlogAdmin(req);
    return this.automationTokenService.revokeToken(id);
  }
}
