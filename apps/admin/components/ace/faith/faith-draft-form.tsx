"use client";

import React from "react";
import { Button, Card, Input, Label, Textarea } from "@pathway/ui";
import type {
  FaithAudience,
  FaithDraftInput,
  FaithOptions,
  FaithPayload,
} from "@/lib/ace-faith-api";

type InitialContent = {
  faithContentId?: string;
  draftId?: string;
  expectedUpdatedAt?: string;
  replacement?: boolean;
  title?: string;
  contentPayload?: FaithPayload;
  audience?: FaithAudience;
};

export function FaithDraftForm({
  initial,
  options,
  pending,
  onSave,
  onClose,
}: {
  initial?: InitialContent;
  options: FaithOptions;
  pending: boolean;
  onSave: (
    input: FaithDraftInput & { draftId?: string; expectedUpdatedAt?: string },
  ) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = React.useState(initial?.title ?? "");
  const [body, setBody] = React.useState(initial?.contentPayload?.body ?? "");
  const [sourceLabel, setSourceLabel] = React.useState(
    initial?.contentPayload?.sourceLabel ?? "",
  );
  const [sourceUrl, setSourceUrl] = React.useState(
    initial?.contentPayload?.sourceUrl ?? "",
  );
  const [reflectionPrompt, setReflectionPrompt] = React.useState(
    initial?.contentPayload?.reflectionPrompt ?? "",
  );
  const [audienceType, setAudienceType] = React.useState<
    FaithAudience["type"] | ""
  >(initial?.audience?.type ?? "");
  const activeAgeBandIds = new Set(options.ageBands.map((band) => band.id));
  const hasArchivedAgeBand =
    initial?.audience?.type === "AGE_BAND" &&
    initial.audience.ageBandIds.some((id) => !activeAgeBandIds.has(id));
  const [ageBandIds, setAgeBandIds] = React.useState<string[]>(
    initial?.audience?.type === "AGE_BAND"
      ? initial.audience.ageBandIds.filter((id) => activeAgeBandIds.has(id))
      : [],
  );
  const [validation, setValidation] = React.useState<string | null>(null);

  const toggleAgeBand = (id: string) => {
    setAgeBandIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    if (!audienceType) {
      setValidation("Choose a student audience.");
      return;
    }
    const selectedActiveAgeBandIds = ageBandIds.filter((id) =>
      activeAgeBandIds.has(id),
    );
    if (audienceType === "AGE_BAND" && selectedActiveAgeBandIds.length === 0) {
      setValidation("Choose at least one age band.");
      return;
    }
    if (sourceUrl && !/^https:\/\/[^\s]+$/i.test(sourceUrl.trim())) {
      setValidation("Use a complete HTTPS source link.");
      return;
    }
    setValidation(null);
    void onSave({
      ...(initial?.faithContentId
        ? { faithContentId: initial.faithContentId }
        : {}),
      ...(initial?.draftId && initial.expectedUpdatedAt
        ? {
            draftId: initial.draftId,
            expectedUpdatedAt: initial.expectedUpdatedAt,
          }
        : {}),
      title: title.trim(),
      contentPayload: {
        body: body.trim(),
        ...(sourceLabel.trim() ? { sourceLabel: sourceLabel.trim() } : {}),
        ...(sourceUrl.trim() ? { sourceUrl: sourceUrl.trim() } : {}),
        ...(reflectionPrompt.trim()
          ? { reflectionPrompt: reflectionPrompt.trim() }
          : {}),
      },
      audience:
        audienceType === "AGE_BAND"
          ? { type: "AGE_BAND", ageBandIds: selectedActiveAgeBandIds }
          : { type: "ALL_ACTIVE_STUDENTS" },
    });
  };

  return (
    <Card
      title={
        initial?.draftId
          ? "Edit draft"
          : initial?.replacement
            ? "Replacement draft"
            : initial
              ? "New revision"
              : "New faith content"
      }
      description="Save a private draft. Publication is a separate action."
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="faith-title">Title</Label>
          <Input
            id="faith-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={160}
            required
            disabled={pending}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="faith-body">Content</Label>
          <Textarea
            id="faith-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={10000}
            rows={6}
            required
            disabled={pending}
          />
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-text-primary">
            Student audience
          </legend>
          {hasArchivedAgeBand ? (
            <p role="status" className="text-sm text-status-warning">
              Some previously selected age bands are no longer available. Review
              the audience before saving.
            </p>
          ) : null}
          <label className="flex items-center gap-2 text-sm text-text-primary">
            <input
              type="radio"
              name="faith-audience"
              value="ALL_ACTIVE_STUDENTS"
              checked={audienceType === "ALL_ACTIVE_STUDENTS"}
              onChange={() => setAudienceType("ALL_ACTIVE_STUDENTS")}
              disabled={pending}
            />
            All active students
          </label>
          <label className="flex items-center gap-2 text-sm text-text-primary">
            <input
              type="radio"
              name="faith-audience"
              value="AGE_BAND"
              checked={audienceType === "AGE_BAND"}
              onChange={() => setAudienceType("AGE_BAND")}
              disabled={pending || options.ageBands.length === 0}
            />
            Selected age bands
          </label>
          {audienceType === "AGE_BAND" ? (
            <div className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-2">
              {options.ageBands.map((band) => (
                <label
                  key={band.id}
                  className="flex items-center gap-2 text-sm text-text-primary"
                >
                  <input
                    type="checkbox"
                    checked={ageBandIds.includes(band.id)}
                    onChange={() => toggleAgeBand(band.id)}
                    disabled={pending}
                  />
                  {band.name} ({band.minimumAge}–{band.maximumAge})
                </label>
              ))}
            </div>
          ) : null}
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="faith-source-label">Source label (optional)</Label>
            <Input
              id="faith-source-label"
              value={sourceLabel}
              onChange={(event) => setSourceLabel(event.target.value)}
              maxLength={160}
              disabled={pending}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="faith-source-url">
              HTTPS source link (optional)
            </Label>
            <Input
              id="faith-source-url"
              type="url"
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
              disabled={pending}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="faith-reflection">Reflection prompt (optional)</Label>
          <Textarea
            id="faith-reflection"
            value={reflectionPrompt}
            onChange={(event) => setReflectionPrompt(event.target.value)}
            maxLength={1000}
            rows={2}
            disabled={pending}
          />
        </div>
        {validation ? (
          <p role="alert" className="text-sm text-status-danger">
            {validation}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save draft"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={onClose}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
