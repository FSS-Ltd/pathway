"use client";

import * as React from "react";
import { Badge } from "@pathway/ui";
import { ProfileHeaderCard } from "../profile-header-card";
import type { AdminChildDetail } from "../../lib/api-client";

export function ChildProfileHeader({
  childId,
  detail,
  displayName,
  canEdit,
  photoVersion,
  isUploading,
  onPhoto,
}: {
  childId: string;
  detail: AdminChildDetail;
  displayName: string;
  canEdit: boolean;
  photoVersion: number;
  isUploading: boolean;
  onPhoto: (file: File) => Promise<void>;
}) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  return (
    <ProfileHeaderCard
      name={displayName}
      subtitle={detail.primaryGroupLabel ?? detail.ageGroupLabel ?? undefined}
      avatarSrc={`/api/children/${encodeURIComponent(childId)}/photo?v=${photoVersion}`}
      badges={
        <Badge variant={detail.status === "active" ? "success" : "default"}>
          {detail.status === "active" ? "Active" : "Inactive"}
        </Badge>
      }
      showUploadButton={canEdit}
      onUploadClick={() => fileInputRef.current?.click()}
      isUploading={isUploading}
      fileInputRef={fileInputRef}
      onFileChange={(event) => {
        const file = event.target.files?.[0];
        if (file) void onPhoto(file);
        event.target.value = "";
      }}
      uploadHelpText="An internal photo helps staff identify this person during attendance."
    />
  );
}
