import type { ReactNode } from "react";

type SelectionCardProps = {
  children: ReactNode;
  isSelected: boolean;
  isDisabled?: boolean;
  onClick: () => void;
};

export function SelectionCard({
  children,
  isSelected,
  isDisabled = false,
  onClick,
}: SelectionCardProps) {
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      disabled={isDisabled}
      onClick={onClick}
      className={`w-full rounded-xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-info focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
        isSelected
          ? "border-accent-strong bg-accent-subtle ring-1 ring-accent-strong"
          : "border-border-subtle bg-surface hover:border-border-strong"
      }`}
    >
      {children}
    </button>
  );
}
