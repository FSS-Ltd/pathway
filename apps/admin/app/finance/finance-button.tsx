"use client";

import React from "react";
import { Button as SharedButton, cn, type ButtonProps } from "@pathway/ui";

export const FinanceButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", className, ...props }, ref) => (
    <SharedButton
      {...props}
      ref={ref}
      variant={variant}
      className={cn(
        className,
        variant === "primary"
          ? "text-accent-foreground"
          : variant === "destructive" || variant === "success"
            ? "text-text-primary"
            : undefined,
      )}
    />
  ),
);
FinanceButton.displayName = "FinanceButton";
