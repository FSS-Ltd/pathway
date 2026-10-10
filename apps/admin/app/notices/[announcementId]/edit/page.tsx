"use client";

import { useParams } from "next/navigation";
import { NoticeEditor } from "@/components/notices/notice-editor";
import { useAdminContext } from "@/lib/admin-context";

export default function EditNoticePage() {
  const { announcementId } = useParams<{ announcementId: string }>();
  const { state } = useAdminContext();
  if (state.status !== "ready") return null;
  return (
    <NoticeEditor
      key={`${state.snapshot.activeSiteId}:${announcementId}`}
      draftId={announcementId}
    />
  );
}
