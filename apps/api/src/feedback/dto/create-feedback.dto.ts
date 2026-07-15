import { z } from "zod";

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024; // 5MB

const SCREENSHOT_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

const SCREENSHOT_EXTENSIONS: Record<(typeof SCREENSHOT_CONTENT_TYPES)[number], string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export const createFeedbackDto = z
  .object({
    category: z.enum(["bug", "feature-request", "other"], {
      required_error: "category is required",
    }),
    subject: z
      .string({ required_error: "subject is required" })
      .trim()
      .min(1, "subject cannot be empty")
      .max(200, "subject must be at most 200 characters"),
    description: z
      .string({ required_error: "description is required" })
      .trim()
      .min(1, "description cannot be empty")
      .max(5000, "description must be at most 5000 characters"),
    screenshotBase64: z.string().optional(),
    screenshotContentType: z.enum(SCREENSHOT_CONTENT_TYPES).optional(),
    screenshotFilename: z.string().trim().min(1).max(255).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.screenshotBase64 && !data.screenshotContentType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "screenshotContentType is required when screenshotBase64 is provided",
        path: ["screenshotContentType"],
      });
    }
  });

export type CreateFeedbackDto = z.infer<typeof createFeedbackDto>;

export function decodeScreenshotAttachment(
  base64: string | undefined,
  contentType: string | undefined,
  filename: string | undefined,
): { buffer: Buffer; filename: string; contentType: string } | null {
  if (!base64 || !base64.trim() || !contentType) return null;

  const buffer = Buffer.from(base64, "base64");
  if (buffer.length > MAX_SCREENSHOT_BYTES) {
    throw new Error(
      `Screenshot must be at most ${MAX_SCREENSHOT_BYTES / 1024 / 1024}MB`,
    );
  }

  const extension =
    SCREENSHOT_EXTENSIONS[contentType as (typeof SCREENSHOT_CONTENT_TYPES)[number]] ?? "png";

  return {
    buffer,
    filename: (filename && filename.trim()) || `screenshot.${extension}`,
    contentType,
  };
}
