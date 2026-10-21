"use client";

import React from "react";
import { Button } from "@pathway/ui";

type FinanceConfirmDialogProps = {
  title: string;
  description: string;
  confirmLabel: string;
  busyLabel: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function FinanceConfirmDialog({
  title,
  description,
  confirmLabel,
  busyLabel,
  busy,
  onCancel,
  onConfirm,
}: FinanceConfirmDialogProps) {
  const dialogRef = React.useRef<HTMLDialogElement>(null);
  const titleId = React.useId();
  const descriptionId = React.useId();

  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  const handleCancel = (event: React.SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault();
    if (!busy) onCancel();
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={busy}
      onCancel={handleCancel}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-border-subtle bg-surface p-0 text-text-primary shadow-xl backdrop:bg-black/40"
    >
      <div className="p-5">
        <h3
          id={titleId}
          className="font-heading text-lg font-semibold text-text-primary"
        >
          {title}
        </h3>
        <p
          id={descriptionId}
          className="mt-2 text-sm leading-6 text-text-muted"
        >
          {description}
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            autoFocus
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={busy}>
            {busy ? busyLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
