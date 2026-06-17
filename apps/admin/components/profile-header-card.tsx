"use client";

import * as React from "react";
import { Card, Button } from "@pathway/ui";
import { Camera } from "lucide-react";
import { getInitials } from "@/lib/names";

export type ProfileHeaderCardProps = {
  /** Display name */
  name: string;
  /** Subtitle (e.g. role, "Staff Member", "Primary contact") */
  subtitle?: string;
  /** Avatar image URL, or null to show initials */
  avatarSrc?: string | null;
  /** Optional badges (e.g. Active, Primary contact) */
  badges?: React.ReactNode;
  /** Show upload/change photo button (for self profile) */
  showUploadButton?: boolean;
  /** Called when upload button is clicked */
  onUploadClick?: () => void;
  /** Disable upload button while uploading */
  isUploading?: boolean;
  /** Ref for the hidden file input when using upload */
  fileInputRef?: React.RefObject<HTMLInputElement>;
  /** Handler for file selection when using upload */
  onFileChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Optional explanatory text shown below the upload control */
  uploadHelpText?: React.ReactNode;
};

/**
 * Standard profile/detail header card used across staff, parents, and children.
 * Shows avatar (or initials), name, subtitle, optional badges, and optional upload button.
 */
export function ProfileHeaderCard({
  name,
  subtitle,
  avatarSrc,
  badges,
  showUploadButton = false,
  onUploadClick,
  isUploading = false,
  fileInputRef,
  onFileChange,
  uploadHelpText,
}: ProfileHeaderCardProps) {
  const [avatarError, setAvatarError] = React.useState(false);
  const showImage = avatarSrc && !avatarError;

  React.useEffect(() => {
    setAvatarError(false);
  }, [avatarSrc]);

  return (
    <Card className="p-4">
      <div className="flex flex-col items-center gap-4">
        <div className="flex flex-col items-center gap-0.5">
          <h2 className="text-2xl font-bold text-text-primary">{name}</h2>
          {subtitle ? (
            <span className="text-xs font-bold text-accent-strong">
              {subtitle}
            </span>
          ) : null}
          {badges ? (
            <div className="mt-1 flex flex-wrap justify-center gap-2">
              {badges}
            </div>
          ) : null}
        </div>
        <div className="relative flex flex-col items-center gap-2">
          <div className="relative flex h-[180px] w-[180px] items-center justify-center rounded-full ring-[8px] ring-accent-secondary">
            <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-accent-subtle text-4xl font-bold text-accent-strong">
              {showImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarSrc}
                  alt=""
                  width={180}
                  height={180}
                  className="h-full w-full object-cover"
                  onError={() => setAvatarError(true)}
                />
              ) : null}
              <span
                className={showImage ? "hidden" : ""}
                aria-hidden
              >
                {getInitials(name)}
              </span>
            </div>
          </div>
          {showUploadButton && onUploadClick ? (
            <>
              {onFileChange && fileInputRef ? (
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={onFileChange}
                />
              ) : null}
              <Button
                type="button"
                size="sm"
                onClick={onUploadClick}
                disabled={isUploading}
                className="mt-4 gap-2"
              >
                <Camera className="h-4 w-4" />
                {isUploading ? "Uploading…" : "Upload / Change photo"}
              </Button>
            </>
          ) : null}
          {uploadHelpText ? (
            <p className="max-w-sm text-center text-xs text-text-muted">
              {uploadHelpText}
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
