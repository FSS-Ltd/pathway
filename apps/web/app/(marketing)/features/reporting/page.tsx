import Link from "next/link";
import CtaButton from "../../../../components/cta-button";
import PageWrapper from "../../../../components/page-wrapper";
import FeatureBreadcrumbJsonLd from "../../../../components/seo/feature-breadcrumb-json-ld";
import { configuratorRolloutHref } from "../../../../lib/configurator-rollout";
import { metadataForPath } from "../../../../lib/seo";

export const metadata = metadataForPath("/features/reporting");

const outcomes = [
  "Get a clearer view of attendance, staffing, and activity trends across your organisation.",
  "Reduce time spent compiling reports from disconnected sources.",
  "Support better planning with consistent operational evidence.",
  "Share reporting confidence with internal stakeholders and governance teams.",
];

export default function ReportingFeaturePage() {
  return (
    <PageWrapper>
      <FeatureBreadcrumbJsonLd name="Reporting" path="/features/reporting" />
      <div className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-16 md:py-24">
        <section className="flex flex-col gap-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-accent-strong">
            Feature
          </p>
          <h1 className="text-4xl font-bold text-pw-text md:text-5xl">
            Reporting
          </h1>
          <p className="text-lg text-pw-text-muted">
            Bring attendance, scheduling, communication, and safeguarding
            signals together into reporting leaders can use.
          </p>
        </section>

        <section className="rounded-xl border border-pw-border bg-white p-6 shadow-soft">
          <h2 className="mb-3 text-2xl font-semibold text-pw-text">
            Replace fragmented tools
          </h2>
          <p className="text-pw-text-muted leading-relaxed">
            Replace spreadsheet rollups, group chat updates, separate parent app
            data, and disconnected logs with reporting built on one operational
            system.
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
            Leaders get stronger operational visibility, staff get less manual
            reporting admin, and families benefit from better-informed planning
            and communication.
          </p>
        </section>

        <section className="rounded-xl border border-pw-border bg-white p-6 shadow-soft">
          <h2 className="mb-3 text-2xl font-semibold text-pw-text">
            Check your reporting needs
          </h2>
          <p className="text-pw-text-muted leading-relaxed">
            Ask which reports are available, how each figure is defined, which
            roles can view the underlying records and what can be exported. This
            keeps reporting expectations tied to the decisions your team needs
            to make.
          </p>
        </section>

        <section className="rounded-xl border border-pw-border bg-white p-6 shadow-soft">
          <h2 className="mb-3 text-2xl font-semibold text-pw-text">
            See it in action
          </h2>
          <p className="mb-5 text-pw-text-muted">
            See how connected reporting supports day-to-day decisions and
            long-term planning.
          </p>
          <div className="flex flex-wrap gap-4">
            <CtaButton href="/demo" location="feature_reporting_cta_primary">
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
