"use client";

import React from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  Button,
  buttonVariants,
  Card,
  cn,
  Input,
  Label,
  Select,
  Textarea,
} from "@pathway/ui";
import { submitFeedback, setApiClientToken } from "../../lib/api-client";

type Category = "bug" | "feature-request" | "other";

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024; // 5MB, must match API
const ACCEPTED_SCREENSHOT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

type SelectedScreenshot = {
  name: string;
  base64: string;
  contentType: string;
  sizeInBytes: number;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function FeedbackPage() {
  const { data: session, status: sessionStatus } = useSession();
  const fileInputId = React.useId();

  const [category, setCategory] = React.useState<Category>("bug");
  const [subject, setSubject] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [screenshot, setScreenshot] = React.useState<SelectedScreenshot | null>(null);
  const [screenshotError, setScreenshotError] = React.useState<string | null>(null);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (sessionStatus !== "authenticated" || !session) return;
    const token = (session as { accessToken?: string })?.accessToken ?? null;
    setApiClientToken(token);
  }, [sessionStatus, session]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setScreenshotError(null);
    if (!ACCEPTED_SCREENSHOT_TYPES.includes(file.type)) {
      setScreenshotError("Please choose a PNG, JPEG, WEBP, or GIF image.");
      return;
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      setScreenshotError(
        `Screenshot is too large (${formatFileSize(file.size)}). Max size is ${formatFileSize(MAX_SCREENSHOT_BYTES)}.`,
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] ?? "" : "";
      setScreenshot({
        name: file.name,
        base64,
        contentType: file.type,
        sizeInBytes: file.size,
      });
    };
    reader.readAsDataURL(file);
  };

  const clearScreenshot = () => {
    setScreenshot(null);
    setScreenshotError(null);
  };

  const resetForm = () => {
    setCategory("bug");
    setSubject("");
    setDescription("");
    clearScreenshot();
  };

  const canSubmit = Boolean(subject.trim() && description.trim() && !screenshotError);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) {
      setSubmitError("Please enter a subject and description.");
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await submitFeedback({
        category,
        subject,
        description,
        ...(screenshot
          ? {
              screenshotBase64: screenshot.base64,
              screenshotContentType: screenshot.contentType,
              screenshotFilename: screenshot.name,
            }
          : {}),
      });
      toast.success("Thanks — your feedback has been sent to the team.");
      resetForm();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to submit feedback";
      setSubmitError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card
        title="Feedback & feature requests"
        description="Report a bug or suggest a feature. This goes straight to the support team."
      >
        {submitError ? (
          <div className="mb-4 rounded-md border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
            {submitError}
          </div>
        ) : null}

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="category">Category</Label>
            <Select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
              className="max-w-md"
            >
              <option value="bug">Bug</option>
              <option value="feature-request">Feature request</option>
              <option value="other">Other</option>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Short summary"
              maxLength={200}
              className="max-w-md"
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What happened, or what would you like to see?"
              rows={6}
              maxLength={5000}
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Screenshot (optional)</Label>
            <div className="flex items-center gap-2">
              <input
                id={fileInputId}
                type="file"
                accept={ACCEPTED_SCREENSHOT_TYPES.join(",")}
                className="sr-only"
                onChange={handleFileChange}
                aria-label="Upload screenshot"
              />
              <label
                htmlFor={fileInputId}
                className={cn(
                  buttonVariants({ variant: "secondary", size: "sm" }),
                  "cursor-pointer",
                )}
              >
                Choose screenshot
              </label>
              {screenshot ? (
                <span className="flex items-center gap-2 text-sm text-status-ok">
                  {screenshot.name} — {formatFileSize(screenshot.sizeInBytes)}
                  <button
                    type="button"
                    onClick={clearScreenshot}
                    className="text-text-muted underline"
                  >
                    Remove
                  </button>
                </span>
              ) : null}
            </div>
            {screenshotError ? (
              <p className="text-xs text-status-danger">{screenshotError}</p>
            ) : null}
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button type="submit" disabled={!canSubmit || isSubmitting}>
              {isSubmitting ? "Submitting…" : "Submit feedback"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
