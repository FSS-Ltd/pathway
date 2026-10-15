"use client";

import * as React from "react";
import { Button } from "@pathway/ui";
import {
  fetchMessageEmailPreference,
  saveMessageEmailPreference,
  type MessageEmailPreference,
} from "@/lib/ace-message-email-api";
import { requestFailure } from "@/lib/request-error";

export function MessageEmailPreferenceForm({ path }: { path: string }) {
  const [preference, setPreference] =
    React.useState<MessageEmailPreference | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void fetchMessageEmailPreference(path, controller.signal)
      .then(setPreference)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            requestFailure(cause, "Email settings could not be loaded.")
              .message,
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preference || saving) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      setPreference(
        await saveMessageEmailPreference(path, {
          enabled: preference.enabled,
          quietHoursStart: preference.quietHoursStart,
          quietHoursEnd: preference.quietHoursEnd,
        }),
      );
      setSaved(true);
    } catch (cause: unknown) {
      setError(
        requestFailure(cause, "Email settings could not be saved.").message,
      );
    } finally {
      setSaving(false);
    }
  }

  function change(input: Partial<MessageEmailPreference>) {
    setSaved(false);
    setPreference((current) => (current ? { ...current, ...input } : null));
  }

  const quietHoursComplete =
    !preference ||
    (!preference.quietHoursStart && !preference.quietHoursEnd) ||
    Boolean(
      preference.quietHoursStart &&
      preference.quietHoursEnd &&
      preference.quietHoursStart !== preference.quietHoursEnd,
    );

  return (
    <div className="space-y-4">
      <p className="text-text-muted">
        Get a private email when a new message arrives. Emails never include the
        message itself.
      </p>
      {loading ? (
        <p role="status" className="text-text-muted">
          Loading email settings…
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-status-danger">
          {error}
        </p>
      ) : null}
      {preference ? (
        <form onSubmit={(event) => void save(event)} className="space-y-4">
          <label className="flex min-h-11 items-center gap-3 font-medium text-text-primary">
            <input
              type="checkbox"
              checked={preference.enabled}
              disabled={saving || !preference.timezone}
              onChange={(event) => change({ enabled: event.target.checked })}
              className="h-5 w-5 accent-accent-strong"
            />
            Send me email alerts
          </label>
          {!preference.timezone ? (
            <p className="text-status-danger">
              Your school must set its timezone before email alerts can be
              enabled.
            </p>
          ) : null}
          <fieldset className="space-y-2">
            <legend className="font-medium text-text-primary">
              Quiet hours
            </legend>
            <p className="text-text-muted">
              Alerts are skipped during these hours in{" "}
              {preference.timezone ?? "your school’s timezone"}.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-text-primary">
                From
                <input
                  type="time"
                  value={preference.quietHoursStart ?? ""}
                  disabled={saving}
                  onChange={(event) =>
                    change({ quietHoursStart: event.target.value || null })
                  }
                  className="min-h-11 rounded-lg border border-border-subtle bg-surface px-3 text-text-primary"
                />
              </label>
              <label className="flex flex-col gap-1 text-text-primary">
                Until
                <input
                  type="time"
                  value={preference.quietHoursEnd ?? ""}
                  disabled={saving}
                  onChange={(event) =>
                    change({ quietHoursEnd: event.target.value || null })
                  }
                  className="min-h-11 rounded-lg border border-border-subtle bg-surface px-3 text-text-primary"
                />
              </label>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={
                  saving ||
                  (!preference.quietHoursStart && !preference.quietHoursEnd)
                }
                onClick={() =>
                  change({ quietHoursStart: null, quietHoursEnd: null })
                }
              >
                Clear
              </Button>
            </div>
            {!quietHoursComplete ? (
              <p role="alert" className="text-status-danger">
                Set two different times, or clear both.
              </p>
            ) : null}
          </fieldset>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={saving || !quietHoursComplete}>
              {saving ? "Saving…" : "Save email settings"}
            </Button>
            {saved ? (
              <span role="status" className="text-status-success">
                Saved
              </span>
            ) : null}
          </div>
        </form>
      ) : null}
    </div>
  );
}
