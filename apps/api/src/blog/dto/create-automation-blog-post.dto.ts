import { z } from "zod";

export const createAutomationBlogPostDto = z.object({
  title: z.string().min(1, "Title is required"),
  slug: z
    .string()
    .min(1, "Slug is required")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens"),
  excerpt: z.string().optional(),
  contentJson: z.record(z.unknown()),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  thumbnailImageId: z.string().uuid().optional().nullable(),
  headerImageId: z.string().uuid().optional().nullable(),
  tags: z.array(z.string()).optional(),
});

export type CreateAutomationBlogPostDto = z.infer<typeof createAutomationBlogPostDto>;
