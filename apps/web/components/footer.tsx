"use client";

import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useState } from "react";

interface FooterSection {
  title: string;
  links?: Array<{ label: string; href: string }>;
  description?: string;
}

const footerSections: FooterSection[] = [
  {
    title: "Nexsteps",
    description:
      "Connected operations platform for attendance, scheduling, family communication, safeguarding, and reporting.",
  },
  {
    title: "Features",
    links: [
      { label: "Attendance", href: "/features/attendance" },
      { label: "Teams & Scheduling", href: "/features/teams-scheduling" },
      { label: "Family Communication", href: "/features/family-communication" },
      { label: "Safeguarding", href: "/features/safeguarding" },
      { label: "Reporting", href: "/features/reporting" },
      { label: "Pricing", href: "/pricing" },
    ],
  },
  {
    title: "Who It's For",
    links: [
      { label: "Schools", href: "/schools" },
      { label: "Clubs", href: "/clubs" },
      { label: "Churches", href: "/churches" },
      { label: "Charities", href: "/charities" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Blog", href: "/blog" },
      { label: "Security", href: "/security" },
      { label: "Book a demo", href: "/demo" },
      { label: "Join trial waitlist", href: "/trial" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
      { label: "Cookie Policy", href: "/cookies" },
    ],
  },
];

export default function Footer() {
  const [openSections, setOpenSections] = useState<Set<number>>(new Set());

  const toggleSection = (index: number) => {
    const newOpenSections = new Set(openSections);
    if (newOpenSections.has(index)) {
      newOpenSections.delete(index);
    } else {
      newOpenSections.add(index);
    }
    setOpenSections(newOpenSections);
  };

  return (
    <footer className="mt-auto border-t border-border-subtle bg-surface">
      <div className="mx-auto max-w-7xl px-4 py-12">
        {/* Desktop: 5 columns grid */}
        <div className="hidden grid-cols-5 gap-8 md:grid">
          {footerSections.map((section, index) => (
            <div key={index}>
              <h3 className="mb-4 text-sm font-semibold text-text-primary">
                {section.title}
              </h3>
              {section.description && (
                <p className="text-sm text-text-muted">{section.description}</p>
              )}
              {section.links && (
                <ul className="flex flex-col gap-2 text-sm text-text-muted">
                  {section.links.map((link, linkIndex) => (
                    <li key={linkIndex}>
                      <Link
                        href={link.href}
                        className="transition hover:text-text-primary"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>

        {/* Mobile: Accordions */}
        <div className="flex flex-col gap-4 md:hidden">
          {footerSections.map((section, index) => {
            const isOpen = openSections.has(index);
            return (
              <div
                key={index}
                className="border-b border-border-subtle last:border-b-0"
              >
                <button
                  onClick={() => toggleSection(index)}
                  className="flex w-full items-center justify-between py-4 text-left"
                >
                  <h3 className="text-sm font-semibold text-text-primary">
                    {section.title}
                  </h3>
                  <motion.svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-text-muted"
                  >
                    <path
                      d="M4 6L8 10L12 6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </motion.svg>
                </button>
                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="pb-4">
                        {section.description && (
                          <p className="mb-4 text-sm text-text-muted">
                            {section.description}
                          </p>
                        )}
                        {section.links && (
                          <ul className="flex flex-col gap-2 text-sm text-text-muted">
                            {section.links.map((link, linkIndex) => (
                              <li key={linkIndex}>
                                <Link
                                  href={link.href}
                                  className="transition hover:text-text-primary"
                                >
                                  {link.label}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        {/* Copyright */}
        <div className="mt-8 border-t border-border-subtle pt-8 text-center text-sm text-text-muted">
          <p>
            &copy; {new Date().getFullYear()} Nexsteps. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
