"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { Button } from "@pathway/ui";
import { requestFailure } from "@/lib/request-error";

export type Recipient = { id: string; displayName: string };
type RecipientPage = { items: Recipient[]; hasMore: boolean };

export function RecipientPicker({
  onCancel,
  onOpen,
  searchRecipients,
  searchId,
  copy,
  minSearchLength = 2,
}: {
  onCancel?: () => void;
  onOpen: (recipient: Recipient) => Promise<boolean>;
  searchRecipients: (
    search: string,
    signal?: AbortSignal,
  ) => Promise<RecipientPage>;
  searchId: string;
  minSearchLength?: number;
  copy: {
    title: string;
    label: string;
    placeholder: string;
    hint: string;
    intro: string;
    noMatch: string;
    searchError: string;
    openError: string;
  };
}) {
  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState<RecipientPage>({
    items: [],
    hasMore: false,
  });
  const [searching, setSearching] = React.useState(false);
  const [resolvedSearch, setResolvedSearch] = React.useState<string | null>(
    null,
  );
  const [searchError, setSearchError] = React.useState<string | null>(null);
  const [retrySearch, setRetrySearch] = React.useState(0);
  const [openError, setOpenError] = React.useState<string | null>(null);
  const [openingId, setOpeningId] = React.useState<string | null>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const mounted = React.useRef(true);
  const search = query.trim();

  React.useEffect(() => {
    mounted.current = true;
    searchRef.current?.focus();
    return () => {
      mounted.current = false;
    };
  }, []);

  React.useEffect(() => {
    setPage({ items: [], hasMore: false });
    setSearchError(null);
    if (search.length < minSearchLength) {
      setSearching(false);
      setResolvedSearch(null);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timeout = window.setTimeout(() => {
      void searchRecipients(search, controller.signal)
        .then((result) => {
          if (!controller.signal.aborted) {
            setPage(result);
            setResolvedSearch(search);
          }
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            setSearchError(requestFailure(error, copy.searchError).message);
            setResolvedSearch(search);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [
    search,
    retrySearch,
    searchRecipients,
    copy.searchError,
    minSearchLength,
  ]);

  async function open(recipient: Recipient) {
    if (openingId) return;
    setOpeningId(recipient.id);
    setOpenError(null);
    try {
      const opened = await onOpen(recipient);
      if (!opened && mounted.current) {
        setOpenError("Your active site changed. Search again.");
      }
    } catch (error) {
      if (mounted.current) {
        setOpenError(requestFailure(error, copy.openError).message);
      }
    } finally {
      if (mounted.current) setOpeningId(null);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-3">
        <h2 className="font-heading text-lg font-semibold text-text-primary">
          {copy.title}
        </h2>
        {onCancel ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={openingId !== null}
            onClick={onCancel}
          >
            Cancel
          </Button>
        ) : null}
      </div>
      <div className="border-b border-border-subtle px-4 py-4">
        <label
          htmlFor={searchId}
          className="mb-2 block text-sm font-medium text-text-primary"
        >
          {copy.label}
        </label>
        <div className="flex min-h-11 items-center gap-2 rounded-xl border border-border-subtle bg-surface px-3 focus-within:ring-2 focus-within:ring-status-info">
          <Search
            className="h-4 w-4 shrink-0 text-text-muted"
            aria-hidden="true"
          />
          <input
            ref={searchRef}
            id={searchId}
            type="search"
            autoComplete="off"
            maxLength={80}
            value={query}
            disabled={openingId !== null}
            onChange={(event) => {
              setQuery(event.target.value);
              setResolvedSearch(null);
              setOpenError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") onCancel?.();
            }}
            placeholder={copy.placeholder}
            aria-describedby={`${searchId}-hint`}
            className="min-w-0 flex-1 bg-transparent py-2 text-sm text-text-primary outline-none placeholder:text-text-muted"
          />
        </div>
        <p id={`${searchId}-hint`} className="mt-2 text-xs text-text-muted">
          {copy.hint}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" aria-live="polite">
        {search.length < minSearchLength ? (
          <p className="px-5 py-6 text-sm text-text-muted">{copy.intro}</p>
        ) : searching || resolvedSearch !== search ? (
          <p role="status" className="px-5 py-6 text-sm text-text-muted">
            {search ? "Searching…" : "Loading people…"}
          </p>
        ) : searchError ? (
          <div className="space-y-3 px-5 py-6">
            <p role="alert" className="text-sm text-status-danger">
              {searchError}
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setResolvedSearch(null);
                setRetrySearch((revision) => revision + 1);
              }}
            >
              {search ? "Retry search" : "Try again"}
            </Button>
          </div>
        ) : page.items.length === 0 ? (
          <p role="status" className="px-5 py-6 text-sm text-text-muted">
            {search ? copy.noMatch : copy.intro}
          </p>
        ) : (
          <>
            <ul
              className="divide-y divide-border-subtle"
              aria-label={copy.label}
            >
              {page.items.map((recipient) => (
                <li key={recipient.id}>
                  <button
                    type="button"
                    disabled={openingId !== null}
                    onClick={() => void open(recipient)}
                    className="flex min-h-14 w-full items-center gap-3 px-5 py-3 text-left text-sm font-medium text-text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-status-info disabled:opacity-50"
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-primary/15 font-semibold text-accent-strong"
                      aria-hidden="true"
                    >
                      {recipient.displayName.charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {recipient.displayName}
                    </span>
                    {openingId === recipient.id ? (
                      <span className="text-xs text-text-muted">Opening…</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
            {page.hasMore ? (
              <p className="px-5 py-3 text-xs text-text-muted">
                More people match. Refine your search to find them.
              </p>
            ) : null}
          </>
        )}
        {openError ? (
          <p role="alert" className="px-5 py-3 text-sm text-status-danger">
            {openError}
          </p>
        ) : null}
      </div>
    </div>
  );
}
