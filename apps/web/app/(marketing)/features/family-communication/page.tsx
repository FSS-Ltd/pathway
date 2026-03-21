import type { Metadata } from "next";
import Link from "next/link";
import CtaButton from "../../../../components/cta-button";
import PageWrapper from "../../../../components/page-wrapper";

export const metadata: Metadata = {
  title: "Family Communication | Nexsteps",
  description:
    "Deliver clearer family communication connected to daily operations and attendance context.",
};

const outcomes = [
  "Send updates from one place instead of juggling multiple channels.",
  "Improve message clarity by tying communication to sessions and attendance context.",
  "Reduce confusion and duplicate responses across teams.",
  "Build trust with more consistent, timely family updates.",
];

export default function FamilyCommunicationFeaturePage() {
  return (
    <PageWrapper>
      <div className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-16 md:py-24">
        <section className="flex flex-col gap-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-accent-strong">
            Feature
          </p>
          <h1 className="text-4xl font-bold text-pw-text md:text-5xl">Family Communication</h1>
          <p className="text-lg text-pw-text-muted">
            Keep families informed through communication that is connected to real
            operational activity, not scattered across disconnected tools.
          </p>
        </section>

        <section className="rounded-xl border border-pw-border bg-white p-6 shadow-soft">
          <h2 className="mb-3 text-2xl font-semibold text-pw-text">Replace fragmented tools</h2>
          <p className="text-pw-text-muted leading-relaxed">
            Replace spreadsheet notes, group chat broadcasts, stand-alone parent apps,
            and separate logs with a connected communication workflow.
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
            Leaders gain communication consistency, staff spend less time chasing
            updates, and parents receive clearer, more dependable information.
          </p>
        </section>

        <section className="rounded-xl border border-pw-border bg-white p-6 shadow-soft">
          <h2 className="mb-3 text-2xl font-semibold text-pw-text">See it in action</h2>
          <p className="mb-5 text-pw-text-muted">
            Discover how family communication works better when connected to the rest of your operations.
          </p>
          <div className="flex flex-wrap gap-4">
            <CtaButton href="/demo" location="feature_family_communication_cta_primary">
              Book a Demo
            </CtaButton>
            <Link
              href="/pricing"
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
