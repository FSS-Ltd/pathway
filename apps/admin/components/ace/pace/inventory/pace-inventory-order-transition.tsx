"use client";

import * as React from "react";
import { Button } from "@pathway/ui";
import { AdminPaceApiError } from "@/lib/api-client";
import { subscribeToActiveSiteChanges } from "@/lib/active-site-events";
import {
  advancePaceInventoryOrder,
  type PaceInventoryNextOrderStatus,
  type PaceInventoryOrderItem,
} from "@/lib/pace-inventory-api";

export function PaceInventoryOrderTransition({
  order,
  onAdvanced,
}: {
  order: PaceInventoryOrderItem;
  onAdvanced: (status: PaceInventoryNextOrderStatus) => void;
}) {
  const nextStatus = order.status === "ORDERED" ? "IN_TRANSIT" : "DELIVERED";
  const actionLabel =
    nextStatus === "IN_TRANSIT" ? "Mark in transit" : "Mark delivered";
  const [isConfirming, setIsConfirming] = React.useState(false);
  const [isPending, setIsPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [completedStatus, setCompletedStatus] =
    React.useState<PaceInventoryNextOrderStatus | null>(null);
  const submitting = React.useRef(false);
  const siteGeneration = React.useRef(0);
  const trigger = React.useRef<HTMLButtonElement>(null);
  const confirm = React.useRef<HTMLButtonElement>(null);
  const descriptionId = React.useId();

  React.useEffect(() => {
    const unsubscribe = subscribeToActiveSiteChanges(() => {
      siteGeneration.current += 1;
    });
    return () => {
      siteGeneration.current += 1;
      unsubscribe();
    };
  }, []);
  React.useEffect(() => {
    if (isConfirming) confirm.current?.focus();
  }, [isConfirming]);

  if (
    order.status === "DELIVERED" ||
    (completedStatus !== null && order.status !== completedStatus)
  )
    return null;

  async function advance() {
    if (submitting.current) return;
    submitting.current = true;
    const requestGeneration = siteGeneration.current;
    setIsPending(true);
    setError(null);
    try {
      await advancePaceInventoryOrder(order.id, nextStatus);
      if (requestGeneration === siteGeneration.current) {
        setCompletedStatus(nextStatus);
        setIsConfirming(false);
        onAdvanced(nextStatus);
      }
    } catch (cause) {
      if (requestGeneration === siteGeneration.current) {
        setError(
          cause instanceof AdminPaceApiError && cause.status < 500
            ? cause.message
            : "Unable to update this PACE order. Please try again.",
        );
      }
    } finally {
      submitting.current = false;
      if (requestGeneration === siteGeneration.current) setIsPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        ref={trigger}
        type="button"
        variant="secondary"
        className="min-h-11"
        aria-expanded={isConfirming}
        aria-controls={isConfirming ? descriptionId : undefined}
        disabled={isPending}
        onClick={() => {
          setError(null);
          setIsConfirming(true);
        }}
      >
        {actionLabel}
      </Button>
      {isConfirming ? (
        <div
          id={descriptionId}
          className="rounded-lg border border-border-subtle bg-surface-alt p-3"
        >
          <p className="text-sm leading-6 text-text-primary">
            {nextStatus === "DELIVERED"
              ? `Confirm PACE ${order.paceNumber} was delivered to ${order.child.displayName}. This adds it to physical stock.`
              : `Confirm PACE ${order.paceNumber} is in transit for ${order.child.displayName}.`}
          </p>
          {error ? (
            <p role="alert" className="mt-2 text-sm text-status-danger">
              {error}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              ref={confirm}
              type="button"
              disabled={isPending}
              onClick={advance}
            >
              {isPending ? "Updating…" : `Confirm ${actionLabel.toLowerCase()}`}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={isPending}
              onClick={() => {
                setIsConfirming(false);
                setError(null);
                trigger.current?.focus();
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
