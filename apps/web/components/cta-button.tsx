"use client";

import Link from "next/link";
import { track } from "../lib/analytics";

interface CtaButtonProps {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  location: string;
  sector?: string | null;
  className?: string;
}

/**
 * CTA button component with analytics tracking.
 */
export default function CtaButton({
  href,
  children,
  variant = "primary",
  location,
  sector,
  className = "",
}: CtaButtonProps) {
  const handleClick = () => {
    if (href.startsWith("/demo") || href.includes("/demo")) {
      track({
        type: "cta_demo_click",
        location,
        sector: sector || null,
      });
    }
  };

  const baseClasses =
    variant === "primary"
      ? "rounded-md bg-accent-primary px-6 py-3 text-base font-medium text-text-primary shadow-sm transition hover:bg-accent-strong"
      : "rounded-md border border-border-subtle bg-surface px-6 py-3 text-base font-medium text-text-primary transition hover:bg-muted";

  return (
    <Link
      href={href}
      onClick={handleClick}
      className={`${baseClasses} ${className}`}
    >
      {children}
    </Link>
  );
}
