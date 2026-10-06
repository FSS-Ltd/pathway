"use client";

import * as React from "react";
import { Button } from "@pathway/ui";
import { AdminPaceApiError } from "@/lib/api-client";
import {
  createPaceInventoryOrders,
  type PaceInventoryStockItem,
} from "@/lib/pace-inventory-api";

const CATALOGUE_END = 1144;
const PAGE_SIZE = 12;
const MAX_ORDER_SIZE = 24;

export function PaceInventoryOrderForm({
  item,
  onCancel,
  onCreated,
}: {
  item: PaceInventoryStockItem;
  onCancel: () => void;
  onCreated: (created: number) => void;
}) {
  const [selected, setSelected] = React.useState<number[]>([]);
  const [visibleCount, setVisibleCount] = React.useState(PAGE_SIZE);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const submitting = React.useRef(false);
  const selectionRef = React.useRef<HTMLFieldSetElement>(null);
  const hintId = React.useId();
  const current =
    item.currentPace < 1000 ? item.currentPace + 1000 : item.currentPace;
  const future = Array.from(
    { length: Math.max(0, CATALOGUE_END - current) },
    (_, index) => current + index + 1,
  );
  const supplied = new Set(item.futurePaceNumbers);

  React.useEffect(() => selectionRef.current?.focus(), []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || selected.length === 0 || pending) return;
    submitting.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await createPaceInventoryOrders({
        childId: item.child.id,
        subjectId: item.subject.id,
        paceNumbers: selected,
      });
      onCreated(result.created);
    } catch (cause) {
      setError(
        cause instanceof AdminPaceApiError && cause.status < 500
          ? cause.message
          : "Unable to create this PACE order. Please try again.",
      );
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  function toggle(number: number) {
    setError(null);
    setSelected((currentSelection) =>
      currentSelection.includes(number)
        ? currentSelection.filter((value) => value !== number)
        : [...currentSelection, number].sort((left, right) => left - right),
    );
  }

  return (
    <form
      className="mt-4 space-y-4 rounded-xl border border-border-subtle bg-surface-alt p-4"
      onSubmit={submit}
    >
      <fieldset
        ref={selectionRef}
        tabIndex={-1}
        disabled={pending}
        aria-describedby={hintId}
      >
        <legend className="font-medium text-text-primary">
          Order future PACEs for {item.child.displayName} · {item.subject.name}
        </legend>
        <p id={hintId} className="mt-1 text-sm leading-6 text-text-muted">
          Choose up to 24 future PACEs. Supplied numbers are unavailable;
          existing orders are checked when you submit.
        </p>
        {future.length === 0 ? (
          <p className="mt-3 text-sm text-text-muted">
            This placement is at the final PACE.
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {future.slice(0, visibleCount).map((number) => {
              const inStock = supplied.has(number);
              return (
                <label
                  key={number}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border-subtle bg-surface px-3 text-sm text-text-primary has-[:checked]:border-accent-strong has-[:checked]:bg-accent-subtle has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-strong"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(number)}
                    disabled={
                      inStock ||
                      (selected.length >= MAX_ORDER_SIZE &&
                        !selected.includes(number))
                    }
                    onChange={() => toggle(number)}
                    className="accent-accent-strong"
                  />
                  <span>#{number}</span>
                  {inStock ? (
                    <span className="text-text-muted">In stock</span>
                  ) : null}
                </label>
              );
            })}
          </div>
        )}
      </fieldset>
      {visibleCount < future.length ? (
        <Button
          type="button"
          variant="secondary"
          className="min-h-11"
          disabled={pending}
          onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
        >
          Show next PACEs
        </Button>
      ) : null}
      <p role="status" className="text-sm text-text-muted">
        {selected.length} selected
      </p>
      {error ? (
        <p role="alert" className="text-sm text-status-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending || selected.length === 0}>
          {pending ? "Creating order…" : "Create order"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
