import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  Optional,
} from "@nestjs/common";
import { prisma } from "@pathway/db";
import { tiptapJsonToHtml } from "./tiptap-to-html";
import type { CreateBlogPostDto } from "./dto/create-blog-post.dto";
import type { UpdateBlogPostDto } from "./dto/update-blog-post.dto";
import { SupabaseStorageService } from "../common/storage/supabase-storage.service";
import { blogAssetKey } from "../common/storage/storage-key.util";
const ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp"] as const;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB

@Injectable()
export class BlogService {
  constructor(
    @Optional()
    @Inject(SupabaseStorageService)
    storage?: SupabaseStorageService,
  ) {
    this.storage = storage ?? new SupabaseStorageService();
  }

  private readonly storage: SupabaseStorageService;

  async createDraft(dto: CreateBlogPostDto) {
    const existing = await prisma.blogPost.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new BadRequestException(`Slug "${dto.slug}" is already in use`);
    }
    return prisma.blogPost.create({
      data: {
        title: dto.title,
        slug: dto.slug,
        excerpt: dto.excerpt ?? null,
        contentJson: (dto.contentJson ?? {
          type: "doc",
          content: [],
        }) as object,
        contentHtml: "",
        seoTitle: dto.seoTitle ?? null,
        seoDescription: dto.seoDescription ?? null,
        thumbnailImageId: dto.thumbnailImageId ?? null,
        headerImageId: dto.headerImageId ?? null,
        tags: dto.tags ?? [],
        status: "DRAFT",
      },
    });
  }

  async updateDraft(id: string, dto: UpdateBlogPostDto) {
    const post = await prisma.blogPost.findUnique({ where: { id } });
    if (!post) throw new NotFoundException("Post not found");
    if (post.status === "PUBLISHED") {
      if (dto.isFeatured === undefined) {
        throw new BadRequestException(
          "Cannot edit a published post directly; only isFeatured can be updated",
        );
      }
      return prisma.blogPost.update({
        where: { id },
        data: { isFeatured: dto.isFeatured },
      });
    }
    if (dto.slug && dto.slug !== post.slug) {
      const existing = await prisma.blogPost.findUnique({
        where: { slug: dto.slug },
      });
      if (existing)
        throw new BadRequestException(`Slug "${dto.slug}" is already in use`);
    }
    return prisma.blogPost.update({
      where: { id },
      data: {
        ...(dto.title != null && { title: dto.title }),
        ...(dto.slug != null && { slug: dto.slug }),
        ...(dto.excerpt !== undefined && { excerpt: dto.excerpt }),
        ...(dto.contentJson != null && {
          contentJson: dto.contentJson as object,
        }),
        ...(dto.seoTitle !== undefined && { seoTitle: dto.seoTitle }),
        ...(dto.seoDescription !== undefined && {
          seoDescription: dto.seoDescription,
        }),
        ...(dto.thumbnailImageId !== undefined && {
          thumbnailImageId: dto.thumbnailImageId,
        }),
        ...(dto.headerImageId !== undefined && {
          headerImageId: dto.headerImageId,
        }),
        ...(dto.tags !== undefined && { tags: dto.tags }),
        ...(dto.isFeatured !== undefined && { isFeatured: dto.isFeatured }),
      },
    });
  }

  async publish(
    id: string,
    baseUrl: string,
    authorUserId?: string,
  ): Promise<{ contentHtml: string; slug: string }> {
    return this.publishOrSchedule(id, baseUrl, authorUserId, undefined);
  }

  async schedule(
    id: string,
    baseUrl: string,
    scheduledAt: Date,
    authorUserId?: string,
  ): Promise<{ contentHtml: string; slug: string }> {
    const now = new Date();
    if (scheduledAt <= now) {
      throw new BadRequestException("Scheduled time must be in the future");
    }
    return this.publishOrSchedule(id, baseUrl, authorUserId, scheduledAt);
  }

  private async publishOrSchedule(
    id: string,
    baseUrl: string,
    authorUserId?: string,
    scheduledAt?: Date,
  ): Promise<{ contentHtml: string; slug: string }> {
    const post = await prisma.blogPost.findUnique({ where: { id } });
    if (!post) throw new NotFoundException("Post not found");
    if (post.status === "PUBLISHED") {
      throw new BadRequestException("Post is already published");
    }
    const contentHtml = tiptapJsonToHtml(post.contentJson, baseUrl);
    const now = new Date();
    const goLiveAt = scheduledAt ?? now;
    const status = scheduledAt ? "SCHEDULED" : "PUBLISHED";

    let authorName: string | null = "Nexsteps";
    let authorAvatarId: string | null = null;
    if (authorUserId) {
      const user = await prisma.user.findUnique({
        where: { id: authorUserId },
        select: {
          displayName: true,
          name: true,
          avatarBytes: true,
          avatarContentType: true,
        },
      });
      if (user) {
        authorName = user.displayName ?? user.name ?? "Nexsteps";
        if (user.avatarBytes && (user.avatarBytes as Buffer).length > 0) {
          const buffer =
            user.avatarBytes instanceof Buffer
              ? user.avatarBytes
              : Buffer.from(user.avatarBytes);
          const mimeType = user.avatarContentType ?? "image/jpeg";
          const asset = await this.createAssetFromBytes(buffer, mimeType);
          authorAvatarId = asset.id;
        }
      }
    }

    const readTimeMinutes = this.estimateReadTime(contentHtml);

    await prisma.blogPost.update({
      where: { id },
      data: {
        status,
        publishedAt: goLiveAt,
        contentHtml,
        authorName,
        authorAvatarId,
        readTimeMinutes,
      },
    });
    return { contentHtml, slug: post.slug };
  }

  /** Promote SCHEDULED posts to PUBLISHED when publishedAt <= now. Called before public queries. */
  async processScheduledPosts(): Promise<void> {
    const now = new Date();
    await prisma.blogPost.updateMany({
      where: {
        status: "SCHEDULED",
        publishedAt: { lte: now },
      },
      data: { status: "PUBLISHED" },
    });
  }

  private estimateReadTime(html: string): number {
    const text = html
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const wordCount = text ? text.split(" ").length : 0;
    const minutes = Math.max(1, Math.ceil(wordCount / 200));
    return minutes;
  }

  private async createAssetFromBytes(
    buffer: Buffer,
    mimeType: string,
  ): Promise<{ id: string }> {
    const crypto = await import("node:crypto");
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    const existing = await prisma.blogAsset.findUnique({ where: { sha256 } });
    if (existing) return { id: existing.id };
    const stored = await this.storage.uploadObject({
      bucket: "public",
      key: blogAssetKey(sha256, mimeType),
      body: buffer,
      contentType: mimeType,
    });
    const asset = await prisma.blogAsset.create({
      data: {
        type: "INLINE",
        storage: stored ? "SUPABASE" : "POSTGRES",
        mimeType,
        byteSize: buffer.length,
        sha256,
        width: null,
        height: null,
        bytes: stored ? null : buffer,
        storageBucket: stored?.bucket ?? null,
        storageKey: stored?.key ?? null,
      },
    });
    return { id: asset.id };
  }

  async listAdmin(limit = 50, cursor?: string) {
    const items = await prisma.blogPost.findMany({
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { updatedAt: "desc" },
    });
    const hasMore = items.length > limit;
    const posts = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? posts[posts.length - 1]?.id : undefined;
    return { posts, nextCursor };
  }

  async getAdminById(id: string) {
    const post = await prisma.blogPost.findUnique({ where: { id } });
    if (!post) throw new NotFoundException("Post not found");
    return post;
  }

  async delete(id: string): Promise<{ slug: string }> {
    const post = await prisma.blogPost.findUnique({ where: { id } });
    if (!post) throw new NotFoundException("Post not found");
    const slug = post.slug;
    await prisma.blogPost.delete({ where: { id } });
    return { slug };
  }

  async listPublic(limit = 20, cursor?: string) {
    await this.processScheduledPosts();
    const now = new Date();
    const items = await prisma.blogPost.findMany({
      where: {
        status: "PUBLISHED",
        publishedAt: { lte: now },
      },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: [{ isFeatured: "desc" }, { publishedAt: "desc" }],
    });
    const hasMore = items.length > limit;
    const posts = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? posts[posts.length - 1]?.id : undefined;
    return { posts, nextCursor };
  }

  async getPublicBySlug(slug: string) {
    await this.processScheduledPosts();
    const now = new Date();
    const post = await prisma.blogPost.findFirst({
      where: {
        slug,
        status: "PUBLISHED",
        publishedAt: { lte: now },
      },
    });
    if (!post) throw new NotFoundException("Post not found");
    return post;
  }

  async getAssetById(
    id: string,
  ): Promise<{ bytes: Buffer; mimeType: string } | null> {
    const asset = await prisma.blogAsset.findUnique({
      where: { id },
      select: {
        bytes: true,
        mimeType: true,
        storageBucket: true,
        storageKey: true,
      },
    });
    if (!asset) return null;
    if (asset.storageBucket && asset.storageKey) {
      const bytes = await this.storage.downloadObject(
        asset.storageBucket,
        asset.storageKey,
      );
      if (bytes) return { bytes, mimeType: asset.mimeType };
    }
    if (!asset.bytes) return null;
    return {
      bytes: Buffer.from(asset.bytes),
      mimeType: asset.mimeType,
    };
  }

  async uploadAsset(
    buffer: Buffer,
    mimeType: string,
    type: "THUMBNAIL" | "HEADER" | "INLINE",
    width?: number,
    height?: number,
  ): Promise<{ id: string; url: string; width?: number; height?: number }> {
    if (!ALLOWED_MIME.includes(mimeType as (typeof ALLOWED_MIME)[number])) {
      throw new BadRequestException(
        `Invalid mime type. Allowed: ${ALLOWED_MIME.join(", ")}`,
      );
    }
    if (buffer.length > MAX_UPLOAD_BYTES) {
      throw new BadRequestException(
        `File too large. Max ${MAX_UPLOAD_BYTES / 1024 / 1024}MB`,
      );
    }
    const crypto = await import("node:crypto");
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    const existing = await prisma.blogAsset.findUnique({ where: { sha256 } });
    if (existing) {
      const baseUrl =
        process.env.PUBLIC_BLOG_BASE_URL ?? "https://nexsteps.dev";
      return {
        id: existing.id,
        url: `${baseUrl}/media/${existing.id}`,
        width: existing.width ?? undefined,
        height: existing.height ?? undefined,
      };
    }
    const stored = await this.storage.uploadObject({
      bucket: "public",
      key: blogAssetKey(sha256, mimeType),
      body: buffer,
      contentType: mimeType,
    });
    const asset = await prisma.blogAsset.create({
      data: {
        type,
        storage: stored ? "SUPABASE" : "POSTGRES",
        mimeType,
        byteSize: buffer.length,
        sha256,
        width: width ?? null,
        height: height ?? null,
        bytes: stored ? null : buffer,
        storageBucket: stored?.bucket ?? null,
        storageKey: stored?.key ?? null,
      },
    });
    const baseUrl = process.env.PUBLIC_BLOG_BASE_URL ?? "https://nexsteps.dev";
    return {
      id: asset.id,
      url: `${baseUrl}/media/${asset.id}`,
      width: asset.width ?? undefined,
      height: asset.height ?? undefined,
    };
  }

  async getRelatedByTags(slug: string, limit = 4) {
    const post = await prisma.blogPost.findUnique({ where: { slug } });
    if (!post || post.status !== "PUBLISHED" || !post.publishedAt) return [];
    const now = new Date();
    if (post.publishedAt > now) return [];
    const tags = post.tags;
    if (tags.length === 0) {
      return prisma.blogPost.findMany({
        where: {
          status: "PUBLISHED",
          publishedAt: { lte: now },
          slug: { not: slug },
        },
        take: limit,
        orderBy: { publishedAt: "desc" },
        select: { slug: true, title: true, excerpt: true, publishedAt: true },
      });
    }
    return prisma.blogPost.findMany({
      where: {
        status: "PUBLISHED",
        publishedAt: { lte: now },
        slug: { not: slug },
        tags: { hasSome: tags },
      },
      take: limit,
      orderBy: { publishedAt: "desc" },
      select: { slug: true, title: true, excerpt: true, publishedAt: true },
    });
  }
}
