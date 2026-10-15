"use client";
import React from "react";
import type { AgreementPeoplePage } from "@pathway/types";
import { agreementsClient } from "@/lib/agreements-client";
import { Action, Feedback, fieldClass, useAgreementRequest } from "./shared";
export function AssignForm({
  versionId,
  onAssigned,
}: {
  versionId: string;
  onAssigned: () => void;
}) {
  const [query, setQuery] = React.useState("");
  const [searchedQuery, setSearchedQuery] = React.useState("");
  const [people, setPeople] = React.useState<AgreementPeoplePage | null>(null);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [confirmed, setConfirmed] = React.useState(false);
  const request = useAgreementRequest();
  return (
    <section className="space-y-4">
      <h4 className="font-semibold">Assign this version</h4>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (request.busy) return;
          const search = query.trim();
          setSearchedQuery(search);
          setPeople(null);
          setSelected([]);
          setConfirmed(false);
          void request.run(async (signal) => {
            const result = await agreementsClient.people(search, signal);
            if (!signal.aborted) {
              setPeople(result);
              setSelected([]);
              setConfirmed(false);
            }
          });
        }}
      >
        <label className="block">
          Find site users
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={fieldClass}
          />
        </label>
        <Action type="submit" variant="secondary" disabled={request.busy}>
          Search recipients
        </Action>
      </form>
      {people && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void request.run(async (signal) => {
              await agreementsClient.assign(versionId, selected, signal);
              if (!signal.aborted) {
                setSelected([]);
                setConfirmed(false);
                onAssigned();
              }
            }, "Assignments recorded.");
          }}
        >
          <fieldset disabled={request.busy} className="min-w-0 space-y-3">
            <legend className="max-w-full whitespace-normal break-words text-sm">
              Select up to 50 adults. Refine your search if someone is missing.
            </legend>
            {people.items.length === 0 && (
              <p>
                {people.nextCursor
                  ? "No matching eligible users in these results. Load more to continue searching."
                  : "No eligible users found."}
              </p>
            )}
            {people.items.map((person) => (
              <label
                key={person.id}
                className="flex min-h-11 items-start gap-3 py-2"
              >
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5 shrink-0"
                  checked={selected.includes(person.id)}
                  disabled={
                    !selected.includes(person.id) && selected.length >= 50
                  }
                  onChange={(e) => {
                    setConfirmed(false);
                    setSelected((previous) =>
                      e.target.checked
                        ? [...previous, person.id]
                        : previous.filter((id) => id !== person.id),
                    );
                  }}
                />
                <span>
                  {person.name}
                  {person.ageStatus === "NEEDS_CONFIRMATION"
                    ? " · Age needs confirmation"
                    : ""}
                </span>
              </label>
            ))}
            {people.nextCursor && (
              <Action
                type="button"
                variant="secondary"
                onClick={() => {
                  if (request.busy) return;
                  const cursor = people.nextCursor;
                  if (!cursor) return;
                  void request.run(async (signal) => {
                    const result = await agreementsClient.people(
                      searchedQuery,
                      signal,
                      cursor,
                    );
                    if (!signal.aborted)
                      setPeople((previous) => ({
                        ...result,
                        items: [
                          ...new Map(
                            [...(previous?.items ?? []), ...result.items].map(
                              (person) => [person.id, person],
                            ),
                          ).values(),
                        ],
                      }));
                  });
                }}
              >
                Load more recipients
              </Action>
            )}
            <label className="flex min-h-11 items-start gap-3 py-2">
              <input
                type="checkbox"
                required
                className="mt-1 h-5 w-5 shrink-0"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <span>
                I have confirmed that every selected recipient is aged 18 or
                over.
              </span>
            </label>
            <Action
              type="submit"
              disabled={!confirmed || selected.length === 0}
            >
              Assign to {selected.length} selected users
            </Action>
          </fieldset>
        </form>
      )}
      <Feedback {...request} />
    </section>
  );
}
