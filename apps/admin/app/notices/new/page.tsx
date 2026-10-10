"use client";

import { NoticeEditor } from "@/components/notices/notice-editor";
import { useAdminContext } from "@/lib/admin-context";

export default function NewNoticePage() {
  const { state } = useAdminContext();
  if (state.status !== "ready") return null;
  return <NoticeEditor key={state.snapshot.activeSiteId} />;
}
