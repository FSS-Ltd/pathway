"use client";

import { ParentNoticeInbox } from "@/components/ace/family/parent-notice-inbox";

export default function ParentNoticesPage({
  params,
}: {
  params: { siteId: string };
}) {
  return <ParentNoticeInbox key={params.siteId} siteId={params.siteId} />;
}
