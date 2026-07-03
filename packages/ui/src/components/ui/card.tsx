import * as React from "react";
import { cn } from "../../lib/cn";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, title, description, actions, children, ...props }, ref) => {
    const hasHeader = title || description || actions;

    return (
      <div
        ref={ref}
        className={cn(
          "rounded-lg border border-border-subtle bg-surface shadow-card transition-transform transition-shadow duration-150 ease-out motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-lg",
          className,
        )}
        {...props}
      >
        {hasHeader ? (
          <div className="flex flex-col items-stretch justify-between gap-4 border-b border-border-subtle px-4 py-4 sm:flex-row sm:items-start sm:px-5">
            <div className="min-w-0 space-y-1">
              {title ? (
                <h3 className="text-lg font-semibold text-text-primary font-heading leading-6">
                  {title}
                </h3>
              ) : null}
              {description ? (
                <p className="text-sm text-text-muted">{description}</p>
              ) : null}
            </div>
            {actions ? (
              <div className="flex w-full items-center gap-2 max-sm:[&>*]:w-full sm:w-auto">
                {actions}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className={cn(hasHeader ? "p-4 sm:p-5 sm:pt-4" : "p-4 sm:p-5")}>
          {children}
        </div>
      </div>
    );
  },
);
Card.displayName = "Card";
