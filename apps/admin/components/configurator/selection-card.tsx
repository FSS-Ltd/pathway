import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  optionCardVariants,
  optionGroupVariants,
  reducedMotionFade,
  reducedOptionGroupVariants,
} from "../../lib/motion";

type SelectionCardProps = {
  children: ReactNode;
  isSelected: boolean;
  isDisabled?: boolean;
  onClick: () => void;
};

type SelectionCardGroupProps = {
  children: ReactNode;
  className: string;
};

export function SelectionCardGroup({
  children,
  className,
}: SelectionCardGroupProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      variants={
        prefersReducedMotion ? reducedOptionGroupVariants : optionGroupVariants
      }
      initial="hidden"
      animate="visible"
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function SelectionCard({
  children,
  isSelected,
  isDisabled = false,
  onClick,
}: SelectionCardProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.button
      type="button"
      variants={
        prefersReducedMotion
          ? {
              hidden: { opacity: 0 },
              visible: { opacity: 1, transition: reducedMotionFade },
            }
          : optionCardVariants
      }
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
    </motion.button>
  );
}
