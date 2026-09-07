import Link from "next/link";
import CtaButton from "../../../../components/cta-button";
import PageWrapper from "../../../../components/page-wrapper";
import FeatureBreadcrumbJsonLd from "../../../../components/seo/feature-breadcrumb-json-ld";
import { configuratorRolloutHref } from "../../../../lib/configurator-rollout";
import { metadataForPath } from "../../../../lib/seo";

export const metadata = metadataForPath("/features/teams-scheduling");

const outcomes = [
  "Publish schedules with clearer ownership and fewer last-minute clashes.",
  "Reduce time spent coordinating availability across separate tools.",
  "Give staff a shared view of who is leading, supporting, and covering sessions.",
  "Improve consistency across sites, classes, and programme groups.",
];

export default function TeamsSchedulingFeaturePage() {
  return (
    <PageWrapper>
      <FeatureBreadcrumbJsonLd
        name="Teams and Scheduling"
        path="/features/teams-scheduling"
      />
      <div className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-16 md:py-24">
        <section className="flex flex-col gap-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-accent-strong">
            Feature
          </p>
          <h1 className="text-4xl font-bold text-pw-text md:text-5xl">
            Teams &amp; Scheduling
          </h1>
          <p className="text-lg text-pw-text-muted">
            Keep staffing and scheduling connected, so plans are easier to
            publish, communicate, and run in real conditions.
          </p>
        </section>

        <section className="rounded-xl border border-pw-border bg-white p-6 shadow-soft">
          <h2 className="mb-3 text-2xl font-semibold text-pw-text">
            Replace fragmented tools
          </h2>
          <p className="text-pw-text-muted leading-relaxed">
            Replace spreadsheet rotas, group chat coordination, separate parent
            apps, and disconnected logs with one place for planning and
            operational follow-through.
          </p>
        </section>

        <section className="rounded-xl border border-pw-border bg-white p-6 shadow-soft">
          <h2 className="mb-4 text-2xl font-semibold text-pw-text">
            Practical outcomes
          </h2>
          <ul className="flex flex-col gap-3 text-pw-text-muted">
            {outcomes.map((outcome) => (
              <li key={outcome}>• {outcome}</li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-pw-border bg-white p-6 shadow-soft">
          <h2 className="mb-3 text-2xl font-semibold text-pw-text">
            Role-based value
          </h2>
          <p className="text-pw-text-muted leading-relaxed">
            Leaders get a clearer staffing picture, staff get less admin
            overhead, and families experience more predictable, consistent
            programme delivery.
          </p>
        </section>

        <section className="rounded-xl border border-pw-border bg-white p-6 shadow-soft">
          <h2 className="mb-3 text-2xl font-semibold text-pw-text">
            Check your workflow
          </h2>
          <p className="text-pw-text-muted leading-relaxed">
            Ask to see how availability, assignments, rota coverage and late
            changes are handled. Confirm which people can publish a schedule and
            how affected team members receive updates.
          </p>
        </section>

        <section className="rounded-xl border border-pw-border bg-white p-6 shadow-soft">
          <h2 className="mb-3 text-2xl font-semibold text-pw-text">
            See it in action
          </h2>
          <p className="mb-5 text-pw-text-muted">
            See how connected scheduling can reduce operational friction across
            your organisation.
          </p>
          <div className="flex flex-wrap gap-4">
            <CtaButton
              href="/demo"
              location="feature_teams_scheduling_cta_primary"
            >
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
