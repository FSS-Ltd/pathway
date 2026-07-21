import type { Metadata } from "next";
import Link from "next/link";
import CtaButton from "../../../../components/cta-button";
import PageWrapper from "../../../../components/page-wrapper";
import { configuratorRolloutHref } from "../../../../lib/configurator-rollout";

export const metadata: Metadata = {
  title: "Safeguarding | Nexsteps",
  description:
    "Use safeguarding as a built-in foundation with audit trails and role-based access across connected operations.",
};

const outcomes = [
  "Keep safeguarding records in context with attendance, sessions, and staffing activity.",
  "Improve accountability with audit trails for sensitive actions and updates.",
  "Apply role-based access so the right people see the right information.",
  "Support consistent follow-through without creating parallel safeguarding workflows.",
];

export default function SafeguardingFeaturePage() {
  return (
    <PageWrapper>
      <div className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-16 md:py-24">
        <section className="flex flex-col gap-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-accent-strong">
            Feature
          </p>
          <h1 className="text-4xl font-bold text-pw-text md:text-5xl">Safeguarding</h1>
          <p className="text-lg text-pw-text-muted">
            Safeguarding is built into the platform foundation, with role-based access
            and auditability across day-to-day operations.
          </p>
        </section>

        <section className="rounded-xl border border-pw-border bg-white p-6 shadow-soft">
          <h2 className="mb-3 text-2xl font-semibold text-pw-text">Replace fragmented tools</h2>
          <p className="text-pw-text-muted leading-relaxed">
            Move away from separate logs, spreadsheet trackers, group chat updates,
            and disconnected parent tooling. Keep sensitive processes anchored in one
            connected operational system.
          </p>
        </section>

        <section className="rounded-xl border border-pw-border bg-white p-6 shadow-soft">
          <h2 className="mb-4 text-2xl font-semibold text-pw-text">Practical outcomes</h2>
          <ul className="flex flex-col gap-3 text-pw-text-muted">
            {outcomes.map((outcome) => (
              <li key={outcome}>• {outcome}</li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-pw-border bg-white p-6 shadow-soft">
          <h2 className="mb-3 text-2xl font-semibold text-pw-text">Role-based value</h2>
          <p className="text-pw-text-muted leading-relaxed">
            Leaders get confidence through auditable oversight, staff can act within
            clear permissions, and families benefit from stronger operational trust and safeguards.
          </p>
        </section>

        <section className="rounded-xl border border-pw-border bg-white p-6 shadow-soft">
          <h2 className="mb-3 text-2xl font-semibold text-pw-text">See it in action</h2>
          <p className="mb-5 text-pw-text-muted">
            Explore how safeguarding fits into a broader connected operations model.
          </p>
          <div className="flex flex-wrap gap-4">
            <CtaButton href="/demo" location="feature_safeguarding_cta_primary">
              Book a Demo
            </CtaButton>
            <Link
              href={configuratorRolloutHref("/pricing")}
              className="rounded-md border border-pw-border bg-white px-6 py-3 text-base font-medium text-pw-text transition hover:bg-pw-surface"
            >
              View Pricing
            </Link>
          </div>
        </section>
      </div>
    </PageWrapper>
  );
}
