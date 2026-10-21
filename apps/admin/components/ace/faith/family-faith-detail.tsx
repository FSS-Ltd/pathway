"use client";

import React from "react";
import { Button, Card } from "@pathway/ui";
import {
  fetchFamilyFaithReflections,
  markFamilyFaithRead,
  submitFamilyFaithReflection,
  type FaithReflectionList,
  type FamilyFaithItem,
} from "@/lib/ace-faith-api";

export function FamilyFaithDetail({
  item,
  siteId,
  childId,
  reflectionsEnabled,
}: {
  item: FamilyFaithItem;
  siteId: string;
  childId?: string;
  reflectionsEnabled: boolean;
}) {
  const [reflections, setReflections] =
    React.useState<FaithReflectionList | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [text, setText] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [readState, setReadState] = React.useState<
    "idle" | "pending" | "done" | "error"
  >("idle");

  React.useEffect(() => {
    const controller = new AbortController();
    void fetchFamilyFaithReflections(
      siteId,
      item.id,
      childId,
      controller.signal,
    )
      .then((data) => {
        if (!controller.signal.aborted) setReflections(data);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            "Reflections could not be loaded. Try opening this reading again.",
          );
      });
    return () => controller.abort();
  }, [siteId, item.id, childId]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > 5000) return;
    setPending(true);
    setError(null);
    try {
      await submitFamilyFaithReflection(siteId, item.id, trimmed);
      setReflections(await fetchFamilyFaithReflections(siteId, item.id));
      setText("");
    } catch {
      setError("Your reflection could not be submitted. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function markRead() {
    setReadState("pending");
    try {
      await markFamilyFaithRead(siteId, item.id);
      setReadState("done");
    } catch {
      setReadState("error");
    }
  }

  const hasSubmitted = !childId && (reflections?.items.length ?? 0) > 0;
  return (
    <div className="space-y-6">
      <Card>
        <p className="whitespace-pre-wrap break-words text-base leading-8 text-text-primary">
          {item.contentPayload.body}
        </p>
        {item.contentPayload.sourceUrl ? (
          <p className="mt-5 text-sm">
            <a
              href={item.contentPayload.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-strong underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
            >
              {item.contentPayload.sourceLabel || "Read the source"}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </p>
        ) : null}
      </Card>

      {!childId ? (
        <div className="space-y-2">
          {readState === "done" ? (
            <p role="status" className="text-sm text-text-muted">
              Marked as read.
            </p>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={readState === "pending"}
              onClick={markRead}
            >
              {readState === "pending" ? "Saving…" : "Mark as read"}
            </Button>
          )}
          {readState === "error" ? (
            <p role="alert" className="text-sm text-text-primary">
              Read status could not be saved. Try again.
            </p>
          ) : null}
        </div>
      ) : null}

      {item.contentPayload.reflectionPrompt ||
      (reflections?.items.length ?? 0) > 0 ? (
        <section aria-label="Reflection" className="space-y-4">
          <h2 className="font-heading text-xl font-semibold text-text-primary">
            Reflection
          </h2>
          {item.contentPayload.reflectionPrompt ? (
            <p className="text-base leading-7 text-text-primary">
              {item.contentPayload.reflectionPrompt}
            </p>
          ) : null}
          {childId ? (
            <p className="text-sm text-text-muted">
              You can see reflections your school has approved and shared with
              you.
            </p>
          ) : !item.contentPayload
              .reflectionPrompt ? null : !reflectionsEnabled ? (
            <p className="text-sm text-text-muted">
              Reflections are not available at the moment.
            </p>
          ) : error ? null : !reflections ? (
            <p role="status" className="text-sm text-text-muted">
              Checking your reflections…
            </p>
          ) : hasSubmitted ? (
            <p role="status" className="text-sm text-text-muted">
              Your reflection was sent to your school for review.
            </p>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <label
                htmlFor="faith-student-reflection"
                className="block text-sm font-semibold text-text-primary"
              >
                Your reflection
              </label>
              <textarea
                id="faith-student-reflection"
                value={text}
                onChange={(event) => setText(event.target.value)}
                maxLength={5000}
                rows={5}
                required
                disabled={pending}
                className="w-full rounded-lg border border-border-subtle bg-surface p-3 text-base text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
              />
              <Button
                type="submit"
                disabled={pending || !text.trim()}
                className="min-h-11"
              >
                {pending ? "Sending…" : "Send reflection"}
              </Button>
            </form>
          )}
          {error ? (
            <p role="alert" className="text-sm text-text-primary">
              {error}
            </p>
          ) : null}
          {!childId &&
            reflections?.items.map((reflection) => (
              <Card key={reflection.id} title="Your reflection">
                <p className="whitespace-pre-wrap break-words text-base leading-7 text-text-primary">
                  {reflection.text}
                </p>
              </Card>
            ))}
          {childId && reflections && reflections.items.length > 0 ? (
            <ul className="space-y-3">
              {reflections.items.map((reflection) => (
                <li
                  key={reflection.id}
                  className="rounded-xl border border-border-subtle bg-surface p-4"
                >
                  <p className="whitespace-pre-wrap break-words text-base leading-7 text-text-primary">
                    {reflection.text}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
