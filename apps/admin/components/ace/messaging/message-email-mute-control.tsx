"use client";

import * as React from "react";
import { Button } from "@pathway/ui";
import {
  fetchConversationEmailMute,
  saveConversationEmailMute,
} from "@/lib/ace-message-email-api";
import { requestFailure } from "@/lib/request-error";

export function MessageEmailMuteControl({
  path,
  conversationId,
}: {
  path: string;
  conversationId: string;
}) {
  const [muted, setMuted] = React.useState<boolean | null>(null);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    setMuted(null);
    setError(null);
    void fetchConversationEmailMute(path, conversationId, controller.signal)
      .then((value) => setMuted(value.muted))
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            requestFailure(
              cause,
              "Conversation email setting could not be loaded.",
            ).message,
          );
        }
      });
    return () => controller.abort();
  }, [path, conversationId]);

  async function toggleMute() {
    if (muted === null || pending) return;
    setPending(true);
    setError(null);
    try {
      setMuted(
        (await saveConversationEmailMute(path, conversationId, !muted)).muted,
      );
    } catch (cause: unknown) {
      setError(
        requestFailure(cause, "Conversation email setting could not be saved.")
          .message,
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-border-subtle pt-4">
      <div className="flex-1">
        <p className="font-medium text-text-primary">This conversation</p>
        <p className="text-text-muted">Mute email alerts from this thread.</p>
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={muted === null || pending}
        onClick={() => void toggleMute()}
      >
        {pending ? "Saving…" : muted ? "Unmute" : "Mute"}
      </Button>
      {error ? (
        <p role="alert" className="w-full text-status-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
