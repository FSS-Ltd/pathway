"use client";

import Link from "next/link";
import CtaButton from "./cta-button";

export default function HomeCtaSection() {
  return (
    <section className="mx-auto max-w-7xl px-4 pb-20 pt-8 md:pb-24">
      <div className="rounded-xl border border-border-subtle bg-surface p-8 shadow-soft md:p-12">
        <h2 className="mb-3 text-3xl font-bold text-text-primary md:text-4xl">
          Ready to run operations from one connected system?
        </h2>
        <p className="mb-6 max-w-3xl text-lg text-text-muted">
          See how Nexsteps helps your team stay aligned across attendance, scheduling,
          family communication, safeguarding, and reporting.
        </p>
        <div className="flex flex-wrap gap-4">
          <CtaButton href="/demo" location="home_final_cta" variant="primary">
            Book a demo
          </CtaButton>
          <Link
            href="/pricing"
            className="rounded-md border border-border-subtle bg-surface px-6 py-3 text-base font-medium text-text-primary transition hover:bg-muted"
          >
            View pricing
          </Link>
        </div>
      </div>
    </section>
  );
}
