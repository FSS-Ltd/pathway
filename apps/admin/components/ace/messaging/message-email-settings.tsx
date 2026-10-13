"use client";

import * as React from "react";
import { Bell, ChevronDown } from "lucide-react";
import { MessageEmailMuteControl } from "./message-email-mute-control";
import { MessageEmailPreferenceForm } from "./message-email-preference-form";

interface MessageEmailSettingsProps {
  path: string;
  conversationId: string | null;
}

export function MessageEmailSettings({
  path,
  conversationId,
}: MessageEmailSettingsProps) {
  const [opened, setOpened] = React.useState(false);
  return (
    <details
      onToggle={(event) => setOpened(event.currentTarget.open)}
      className="group rounded-2xl border border-border-subtle bg-surface px-4 py-3 shadow-sm"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 text-sm font-semibold text-text-primary marker:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong">
        <Bell className="h-4 w-4 text-accent-strong" aria-hidden="true" />
        Email alerts
        <span className="ml-auto text-xs font-medium text-text-muted">
          Manage
        </span>
        <ChevronDown
          className="h-4 w-4 text-text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </summary>
      {opened ? (
        <div className="space-y-4 border-t border-border-subtle pt-4 text-sm">
          <MessageEmailPreferenceForm path={path} />
          {conversationId ? (
            <MessageEmailMuteControl
              path={path}
              conversationId={conversationId}
            />
          ) : null}
        </div>
      ) : null}
    </details>
  );
}
