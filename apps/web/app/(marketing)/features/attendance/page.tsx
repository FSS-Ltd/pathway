import type { Metadata } from "next";
import Link from "next/link";
import CtaButton from "../../../../components/cta-button";
import PageWrapper from "../../../../components/page-wrapper";

export const metadata: Metadata = {
  title: "Attendance | Nexsteps",
  description:
    "Run attendance as one connected workflow across registers, staff updates, and family visibility.",
};

const outcomes = [
  "Capture registers quickly with fewer handoffs between staff.",
  "See attendance patterns across groups without manual spreadsheet merges.",
  "Reduce follow-up gaps with clearer same-day visibility.",
  "Keep records accurate with one source of truth for session attendance.",
];

export default function AttendanceFeaturePage() {
  return (
    <PageWrapper>
      <div className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-16 md:py-24">
        <section className="flex flex-col gap-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-accent-strong">
            Feature
          </p>
          <h1 className="text-4xl font-bold text-pw-text md:text-5xl">Attendance</h1>
          <p className="text-lg text-pw-text-muted">
            Keep attendance connected to daily operations, so leaders and staff can
            act quickly without chasing updates across disconnected systems.
          </p>
        </section>

        <section className="rounded-xl border border-pw-border bg-white p-6 shadow-soft">
          <h2 className="mb-3 text-2xl font-semibold text-pw-text">Replace fragmented tools</h2>
          <p className="text-pw-text-muted leading-relaxed">
            Move away from spreadsheets, group chats, separate parent apps, and
            stand-alone logs. Nexsteps keeps attendance activity in one operational
            flow so information is easier to trust and act on.
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
            Leaders get clearer oversight of attendance trends, staff get faster
            day-to-day workflows, and families benefit from more reliable updates.
          </p>
        </section>

        <section className="rounded-xl border border-pw-border bg-white p-6 shadow-soft">
          <h2 className="mb-3 text-2xl font-semibold text-pw-text">See it in action</h2>
          <p className="mb-5 text-pw-text-muted">
            Explore how attendance fits into a connected operations model across your
            teams and sessions.
          </p>
          <div className="flex flex-wrap gap-4">
            <CtaButton href="/demo" location="feature_attendance_cta_primary">
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
