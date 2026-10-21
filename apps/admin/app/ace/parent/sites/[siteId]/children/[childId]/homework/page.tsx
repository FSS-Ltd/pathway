"use client";

import { GuardianHomeworkWorkspace } from "@/components/ace/homework/guardian-homework-workspace";
import { Card } from "@pathway/ui";

export default function GuardianHomeworkPage({
  params,
}: {
  params: { siteId: string; childId: string };
}) {
  if (process.env.NEXT_PUBLIC_ACE_HOMEWORK_WEB_ENABLED !== "true") {
    return (
      <main>
        <Card title="Homework is not available yet">
          <p className="text-sm text-text-muted">
            Your school will let you know when homework is ready here.
          </p>
        </Card>
      </main>
    );
  }
  return (
    <GuardianHomeworkWorkspace
      siteId={params.siteId}
      childId={params.childId}
    />
  );
}
