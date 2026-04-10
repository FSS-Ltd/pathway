"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { track } from "../lib/analytics";

type NavChildLink = {
  label: string;
  href: string;
};

type NavLink = {
  label: string;
  href?: string;
  children?: NavChildLink[];
};

export default function HeaderNav() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [openDesktopDropdown, setOpenDesktopDropdown] = useState<string | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const openDropdown = (label: string) => {
    clearCloseTimer();
    setOpenDesktopDropdown(label);
  };

  const scheduleCloseDropdown = () => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setOpenDesktopDropdown(null);
    }, 120);
  };

  const handleLoginClick = () => {
    const path = window.location.pathname;
    const sector = path.startsWith("/schools")
      ? "schools"
      : path.startsWith("/clubs")
        ? "clubs"
        : path.startsWith("/churches")
          ? "churches"
          : path.startsWith("/charities")
            ? "charities"
            : null;
    track({
      type: "app_login_click",
      location: "header_nav",
      sector,
    });
  };

  const handleDemoClick = () => {
    const path = window.location.pathname;
    const sector = path.startsWith("/schools")
      ? "schools"
      : path.startsWith("/clubs")
        ? "clubs"
        : path.startsWith("/churches")
          ? "churches"
          : path.startsWith("/charities")
            ? "charities"
            : null;
    track({
      type: "cta_demo_click",
      location: "header_nav",
      sector,
    });
  };

  const navLinks: NavLink[] = [
    {
      label: "Features",
      children: [
        { label: "Attendance", href: "/features/attendance" },
        { label: "Teams & Scheduling", href: "/features/teams-scheduling" },
        { label: "Family Communication", href: "/features/family-communication" },
        { label: "Safeguarding", href: "/features/safeguarding" },
      ],
    },
    { label: "Reporting", href: "/features/reporting" },
    { label: "Pricing", href: "/pricing" },
    {
      label: "Toolkit",
      children: [
        { label: "Assessment Test", href: "/readiness-score" },
        { label: "Free Toolkit", href: "/toolkit" },
      ],
    },
    { label: "Resources", href: "/blog" },
    {
      label: "Who It's For",
      children: [
        { label: "Schools", href: "/schools" },
        { label: "Clubs", href: "/clubs" },
        { label: "Churches", href: "/churches" },
        { label: "Charities", href: "/charities" },
      ],
    },
  ];

  return (
    <>
      <nav className="hidden items-center gap-6 min-[1021px]:flex">
        {navLinks.map((link) =>
          link.children ? (
            <div
              key={link.label}
              className="relative"
              onMouseEnter={() => openDropdown(link.label)}
              onMouseLeave={scheduleCloseDropdown}
            >
              <button
                type="button"
                className="inline-flex items-center gap-1 text-sm font-medium text-text-primary transition hover:text-accent-primary"
                aria-haspopup="menu"
                aria-expanded={openDesktopDropdown === link.label}
                onFocus={() => openDropdown(link.label)}
                onBlur={scheduleCloseDropdown}
                onClick={() =>
                  setOpenDesktopDropdown((current) => (current === link.label ? null : link.label))
                }
              >
                {link.label}
                <svg
                  className="h-3 w-3"
                  viewBox="0 0 16 16"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M4 6L8 10L12 6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <div
                className={`absolute left-0 top-full z-50 pt-2 ${
                  openDesktopDropdown === link.label
                    ? "pointer-events-auto visible"
                    : "pointer-events-none invisible"
                }`}
                onMouseEnter={() => openDropdown(link.label)}
                onMouseLeave={scheduleCloseDropdown}
              >
                <div
                  className={`min-w-48 rounded-lg border border-border-subtle bg-surface p-2 shadow-lg transition-all duration-150 ${
                    openDesktopDropdown === link.label
                      ? "translate-y-0 opacity-100"
                      : "translate-y-1 opacity-0"
                  }`}
                >
                  {link.children.map((child) => (
                    <Link
                      key={child.href}
                      href={child.href}
                      onClick={() => setOpenDesktopDropdown(null)}
                      className="block rounded-md px-3 py-2 text-sm font-medium text-text-primary transition hover:bg-muted hover:text-accent-primary"
                    >
                      {child.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <Link
              key={link.href}
              href={link.href ?? "/"}
              className="text-sm font-medium text-text-primary transition hover:text-accent-primary"
            >
              {link.label}
            </Link>
          ),
        )}

        <div className="ml-4 flex items-center gap-3">
          <Link
            href="https://app.nexsteps.dev"
            onClick={handleLoginClick}
            className="rounded-md border border-border-subtle bg-surface px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-muted"
          >
            Sign in
          </Link>
          <Link
            href="/demo"
            onClick={handleDemoClick}
            className="rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-text-primary shadow-sm transition hover:bg-accent-strong"
          >
            Request a Demo
          </Link>
        </div>
      </nav>

      <button
        onClick={() => setIsMobileMenuOpen((open) => !open)}
        className="flex flex-col gap-1.5 min-[1021px]:hidden"
        aria-expanded={isMobileMenuOpen}
        aria-label="Toggle menu"
      >
        <span
          className={`h-0.5 w-6 bg-text-primary transition duration-200 ${
            isMobileMenuOpen ? "translate-y-2 rotate-45" : ""
          }`}
        />
        <span
          className={`h-0.5 w-6 bg-text-primary transition duration-200 ${
            isMobileMenuOpen ? "opacity-0" : ""
          }`}
        />
        <span
          className={`h-0.5 w-6 bg-text-primary transition duration-200 ${
            isMobileMenuOpen ? "-translate-y-2 -rotate-45" : ""
          }`}
        />
      </button>

      {isMobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/20 min-[1021px]:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-border-subtle bg-surface p-4 shadow-lg min-[1021px]:hidden">
            <nav className="flex flex-col gap-4">
              {navLinks.map((link) =>
                link.children ? (
                  <details key={link.label} className="group">
                    <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-text-primary transition hover:text-accent-primary">
                      {link.label}
                      <svg
                        className="h-3 w-3 transition group-open:rotate-180"
                        viewBox="0 0 16 16"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M4 6L8 10L12 6"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </summary>
                    <div className="mt-2 flex flex-col gap-1 pl-3">
                      {link.children.map((child) => (
                        <Link
                          key={child.href}
                          href={child.href}
                          onClick={() => setIsMobileMenuOpen(false)}
                          className="rounded-md px-2 py-1.5 text-sm text-text-primary transition hover:bg-muted hover:text-accent-primary"
                        >
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  </details>
                ) : (
                  <Link
                    key={link.href}
                    href={link.href ?? "/"}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="text-sm font-medium text-text-primary transition hover:text-accent-primary"
                  >
                    {link.label}
                  </Link>
                ),
              )}
              <div className="flex flex-col gap-2 border-t border-border-subtle pt-4">
                <Link
                  href="https://app.nexsteps.dev"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    handleLoginClick();
                  }}
                  className="rounded-md border border-border-subtle bg-surface px-4 py-2 text-center text-sm font-medium text-text-primary transition hover:bg-muted"
                >
                  Sign in
                </Link>
                <Link
                  href="/demo"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    handleDemoClick();
                  }}
                  className="rounded-md bg-accent-primary px-4 py-2 text-center text-sm font-medium text-text-primary shadow-sm transition hover:bg-accent-strong"
                >
                  Request a Demo
                </Link>
              </div>
            </nav>
          </div>
        </>
      )}
    </>
  );
}
