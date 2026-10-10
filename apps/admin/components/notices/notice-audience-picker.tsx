"use client";

import * as React from "react";
import { Button, Input, Label, Select } from "@pathway/ui";
import {
  fetchNoticeTargets,
  type NoticeAudienceScope,
  type NoticeTargetOption,
} from "@/lib/ace-notice-api";
import { requestFailure } from "@/lib/request-error";

type SchoolScope = Exclude<NoticeAudienceScope, "SITE">;

export function NoticeAudiencePicker({
  scope,
  targetId,
  pending,
  onScopeChange,
  onTargetChange,
}: {
  scope: NoticeAudienceScope;
  targetId: string | null;
  pending: boolean;
  onScopeChange: (scope: NoticeAudienceScope) => void;
  onTargetChange: (targetId: string | null) => void;
}) {
  const [available, setAvailable] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [options, setOptions] = React.useState<NoticeTargetOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [retry, setRetry] = React.useState(0);

  React.useEffect(() => {
    const controller = new AbortController();
    const lookupScope: SchoolScope = scope === "SITE" ? "YEAR_BAND" : scope;
    setLoading(true);
    setError(null);
    void fetchNoticeTargets(lookupScope, search, targetId, controller.signal)
      .then((result) => {
        setAvailable(result.available);
        setOptions(result.items);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            requestFailure(cause, "Unable to load school audiences.").message,
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [scope, search, targetId, retry]);

  if (!available && !loading && !error) return null;

  return (
    <div className="space-y-3 rounded-xl border border-border-subtle bg-shell/70 p-4">
      <div className="space-y-2">
        <Label htmlFor="notice-audience-scope">Reach</Label>
        <Select
          id="notice-audience-scope"
          value={scope}
          disabled={pending || loading || !available}
          onChange={(event) => {
            setSearch("");
            onScopeChange(event.target.value as NoticeAudienceScope);
          }}
        >
          <option value="SITE">Whole site</option>
          <option value="YEAR_BAND">School year band</option>
          <option value="GROUP">Site group</option>
          <option value="CHILD">One child's guardians</option>
        </Select>
      </div>
      {scope !== "SITE" ? (
        <div className="space-y-2">
          <Label htmlFor="notice-target-search">
            Find{" "}
            {scope === "CHILD"
              ? "child"
              : scope === "GROUP"
                ? "group"
                : "year band"}
          </Label>
          <Input
            id="notice-target-search"
            type="search"
            value={search}
            disabled={pending || !available}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name"
          />
          <Label htmlFor="notice-audience-target">Target</Label>
          <Select
            id="notice-audience-target"
            value={targetId ?? ""}
            disabled={pending || loading || !available}
            onChange={(event) => onTargetChange(event.target.value || null)}
            required
          >
            <option value="">Choose a target</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
          {!loading && options.length === 0 ? (
            <p className="text-sm text-text-muted">
              No matching targets found.
            </p>
          ) : null}
          {scope === "GROUP" || scope === "CHILD" ? (
            <p className="text-sm text-text-muted">
              This reach sends to current full-access guardians only.
            </p>
          ) : null}
        </div>
      ) : null}
      {loading ? (
        <p role="status" className="text-sm text-text-muted">
          Loading school audiences…
        </p>
      ) : null}
      {error ? (
        <div className="flex flex-wrap items-center gap-3">
          <p role="alert" className="text-sm text-status-danger">
            {error}
          </p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setRetry((value) => value + 1)}
          >
            Retry
          </Button>
        </div>
      ) : null}
    </div>
  );
}
