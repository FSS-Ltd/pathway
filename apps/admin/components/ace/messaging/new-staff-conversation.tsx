"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { Button } from "@pathway/ui";
import {
  searchStaffRecipients,
  type StaffRecipient,
  type StaffRecipientPage,
} from "@/lib/ace-messaging-api";

export function NewStaffConversation({
  onCancel,
  onOpen,
}: {
  onCancel: () => void;
  onOpen: (recipient: StaffRecipient) => Promise<boolean>;
}) {
  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState<StaffRecipientPage>({
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
    if (search.length < 2) {
      setSearching(false);
      setResolvedSearch(null);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timeout = window.setTimeout(() => {
      void searchStaffRecipients(search, controller.signal)
        .then((result) => {
          if (!controller.signal.aborted) {
            setPage(result);
            setResolvedSearch(search);
          }
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            setSearchError(
              error instanceof Error
                ? error.message
                : "Unable to search staff.",
            );
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
  }, [search, retrySearch]);

  async function open(recipient: StaffRecipient) {
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
        setOpenError(
          error instanceof Error
            ? error.message
            : "Unable to start this conversation. Try again.",
        );
      }
    } finally {
      if (mounted.current) setOpeningId(null);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-3">
        <h2 className="font-heading text-lg font-semibold text-text-primary">
          New message
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={openingId !== null}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
      <div className="border-b border-border-subtle px-4 py-4">
        <label
          htmlFor="staff-recipient-search"
          className="mb-2 block text-sm font-medium text-text-primary"
        >
          To: Staff member at this site
        </label>
        <div className="flex min-h-11 items-center gap-2 rounded-xl border border-border-subtle bg-surface px-3 focus-within:ring-2 focus-within:ring-status-info">
          <Search
            className="h-4 w-4 shrink-0 text-text-muted"
            aria-hidden="true"
          />
          <input
            ref={searchRef}
            id="staff-recipient-search"
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
              if (event.key === "Escape") onCancel();
            }}
            placeholder="Search staff at this site"
            aria-describedby="staff-recipient-search-hint"
            className="min-w-0 flex-1 bg-transparent py-2 text-sm text-text-primary outline-none placeholder:text-text-muted"
          />
        </div>
        <p
          id="staff-recipient-search-hint"
          className="mt-2 text-xs text-text-muted"
        >
          Enter at least two characters. Only current site staff appear.
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" aria-live="polite">
        {search.length < 2 ? (
          <p className="px-5 py-6 text-sm text-text-muted">
            Search for a colleague to start a private conversation.
          </p>
        ) : searching || resolvedSearch !== search ? (
          <p role="status" className="px-5 py-6 text-sm text-text-muted">
            Searching staff…
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
              Retry search
            </Button>
          </div>
        ) : page.items.length === 0 ? (
          <p role="status" className="px-5 py-6 text-sm text-text-muted">
            No staff match this search at your active site.
          </p>
        ) : (
          <>
            <ul
              className="divide-y divide-border-subtle"
              aria-label="Staff search results"
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
                More staff match. Refine your search to find them.
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
