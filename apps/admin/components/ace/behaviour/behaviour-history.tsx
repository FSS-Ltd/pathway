"use client";

import React from "react";
import { Button } from "@pathway/ui";
import type {
  AdminBehaviourCategory,
  AdminBehaviourCorrectionInput,
  AdminBehaviourCommandResponse,
  AdminBehaviourEntry,
  AdminBehaviourRetractionInput,
  AdminBehaviourRetractionResponse,
  AdminBehaviourVisibility,
} from "@/lib/api-client";
import { BehaviourCorrectionForm } from "./behaviour-correction-form";
import { BehaviourRetractionForm } from "./behaviour-retraction-form";
import { formatSiteDateTime } from "./behaviour-time";

type BehaviourHistoryProps = {
  isLoading: boolean;
  error: string | null;
  items: AdminBehaviourEntry[];
  children: Array<{ id: string; fullName: string }>;
  categories: AdminBehaviourCategory[];
  canCorrect: boolean;
  canVoid: boolean;
  canSensitive: boolean;
  siteTimeZone: string;
  onRetry: () => void;
  onCorrect: (
    entryId: string,
    input: AdminBehaviourCorrectionInput,
  ) => Promise<AdminBehaviourCommandResponse>;
  onRetract: (
    entryId: string,
    input: AdminBehaviourRetractionInput,
  ) => Promise<AdminBehaviourRetractionResponse>;
  onSuccess?: () => Promise<void> | void;
};

export function BehaviourHistory({
  isLoading,
  error,
  items,
  children,
  categories,
  canCorrect,
  canVoid,
  canSensitive,
  siteTimeZone,
  onRetry,
  onCorrect,
  onRetract,
  onSuccess,
}: BehaviourHistoryProps) {
  const [visibility, setVisibility] =
    React.useState<AdminBehaviourVisibility>("GENERAL");
  const selectedVisibility = canSensitive ? visibility : "GENERAL";
  const visibleItems = items.filter(
    (item) => item.visibility === selectedVisibility,
  );
  const childNames = new Map(
    children.map((child) => [child.id, child.fullName]),
  );
  const [correctionTarget, setCorrectionTarget] = React.useState<string | null>(
    null,
  );
  const [retractionTarget, setRetractionTarget] = React.useState<string | null>(
    null,
  );
  const [success, setSuccess] = React.useState<string | null>(null);
  const successRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (canSensitive) return;
    const correction = items.find((item) => item.id === correctionTarget);
    const retraction = items.find((item) => item.id === retractionTarget);
    if (correction?.visibility === "SENSITIVE") setCorrectionTarget(null);
    if (retraction?.visibility === "SENSITIVE") setRetractionTarget(null);
  }, [canSensitive, correctionTarget, retractionTarget, items]);

  React.useEffect(() => {
    if (!canSensitive) setVisibility("GENERAL");
  }, [canSensitive]);

  React.useEffect(() => {
    if (!canCorrect) setCorrectionTarget(null);
    if (!canVoid) setRetractionTarget(null);
  }, [canCorrect, canVoid]);

  React.useEffect(() => {
    if (success) successRef.current?.focus();
  }, [success]);

  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <div>
        <h2 className="font-heading text-lg font-semibold text-text-primary">
          Behaviour history
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          Up to 50 current records are shown newest first. Corrections create a
          linked replacement and keep the original audit trail.
        </p>
      </div>

      {canSensitive ? (
        <fieldset className="mt-5">
          <legend className="text-sm font-medium text-text-primary">
            Record visibility
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["GENERAL", "SENSITIVE"] as const).map((option) => (
              <label
                key={option}
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-text-primary"
              >
                <input
                  type="radio"
                  name="behaviour-history-visibility"
                  value={option}
                  checked={selectedVisibility === option}
                  onChange={() => {
                    setVisibility(option);
                    setCorrectionTarget(null);
                    setRetractionTarget(null);
                    setSuccess(null);
                  }}
                />
                {option === "GENERAL" ? "General records" : "Sensitive records"}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {success ? (
        <div
          ref={successRef}
          className="mt-5 rounded-md bg-green-50 p-3 text-sm text-text-primary"
          role="status"
          tabIndex={-1}
        >
          {success}
        </div>
      ) : null}

      {isLoading ? (
        <div aria-label="Loading behaviour history…" className="mt-5 space-y-2">
          <div className="h-16 animate-pulse rounded-md bg-muted" />
          <div className="h-16 animate-pulse rounded-md bg-muted" />
        </div>
      ) : null}

      {!isLoading && error ? (
        <div
          className="mt-5 rounded-md bg-red-50 p-3 text-sm text-red-700"
          role="alert"
        >
          <p>{error}</p>
          <Button
            id="behaviour-history-retry"
            className="mt-3"
            type="button"
            variant="secondary"
            onClick={onRetry}
          >
            Try again
          </Button>
        </div>
      ) : null}

      {!isLoading && !error && visibleItems.length === 0 ? (
        <p className="mt-5 rounded-md bg-muted p-4 text-sm text-text-muted">
          {selectedVisibility === "SENSITIVE"
            ? "No sensitive records in the recently loaded history."
            : "No behaviour records yet."}
        </p>
      ) : null}

      {!isLoading && !error && visibleItems.length > 0 ? (
        <ol className="mt-5 space-y-3">
          {visibleItems.map((item) => (
            <li key={item.id} className="rounded-md border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-text-primary">
                    {childNames.get(item.childId) ?? "Learner"} ·{" "}
                    {formatCategory(item.category)}
                  </p>
                  <p className="mt-1 text-sm text-text-muted">
                    {formatType(item.type)} · {formatPoints(item.pointsDelta)} ·{" "}
                    <time dateTime={item.occurredAt}>
                      {formatSiteDateTime(item.occurredAt, siteTimeZone)}
                    </time>
                  </p>
                  <p className="mt-2 text-sm text-text-primary">
                    {item.reason}
                  </p>
                  {item.note ? (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-text-muted">
                      {item.note}
                    </p>
                  ) : null}
                </div>
                {canCorrect || canVoid ? (
                  <div className="flex flex-wrap gap-2">
                    {canCorrect ? (
                      <Button
                        id={`behaviour-correct-${item.id}`}
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setSuccess(null);
                          setRetractionTarget(null);
                          setCorrectionTarget(item.id);
                        }}
                      >
                        Correct
                      </Button>
                    ) : null}
                    {canVoid ? (
                      <Button
                        id={`behaviour-void-${item.id}`}
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setSuccess(null);
                          setCorrectionTarget(null);
                          setRetractionTarget(item.id);
                        }}
                      >
                        Void
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {correctionTarget === item.id ? (
                <BehaviourCorrectionForm
                  entry={item}
                  categories={categories}
                  canSensitive={canSensitive}
                  siteTimeZone={siteTimeZone}
                  onCancel={() => setCorrectionTarget(null)}
                  onCorrect={onCorrect}
                  onSuccess={async (response) => {
                    setCorrectionTarget(null);
                    setSuccess(
                      response.duplicate
                        ? "This correction was already recorded."
                        : "Correction recorded.",
                    );
                    await onSuccess?.();
                  }}
                />
              ) : null}
              {retractionTarget === item.id ? (
                <BehaviourRetractionForm
                  entry={item}
                  onCancel={() => setRetractionTarget(null)}
                  onRetract={onRetract}
                  onSuccess={async (response) => {
                    setRetractionTarget(null);
                    setSuccess(
                      response.duplicate
                        ? "This void was already recorded."
                        : "Behaviour record voided.",
                    );
                    await onSuccess?.();
                  }}
                />
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function formatCategory(category: string): string {
  return category
    .split("-")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function formatType(type: AdminBehaviourEntry["type"]): string {
  if (type === "MERIT") return "Merit";
  if (type === "DEMERIT") return "Demerit";
  return "General";
}

function formatPoints(points: number): string {
  if (points > 0) return `+${points} points`;
  if (points < 0) return `${points} points`;
  return "No points";
}
