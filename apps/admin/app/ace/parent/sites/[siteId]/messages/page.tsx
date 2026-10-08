"use client";

import { ParentMessagingWorkspace } from "@/components/ace/messaging/parent-messaging-workspace";

export default function ParentMessagesPage({
  params,
}: {
  params: { siteId: string };
}) {
  return (
    <ParentMessagingWorkspace key={params.siteId} siteId={params.siteId} />
  );
}
