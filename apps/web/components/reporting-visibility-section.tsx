import ScrollReveal from "./scroll-reveal";

const bars = [
  { label: "Attendance", value: 92 },
  { label: "Rota coverage", value: 88 },
  { label: "Safeguarding follow-up", value: 100 },
  { label: "Reporting accuracy", value: 96 },
];

export default function ReportingVisibilitySection() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 md:py-28">
      <div className="grid items-center gap-12 md:grid-cols-2">
        <ScrollReveal>
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-strong">
            Reporting
          </span>
          <h2 className="mt-4 text-3xl font-bold text-text-primary md:text-4xl">
            Reporting and visibility without the spreadsheet chase
          </h2>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-text-muted">
            Turn operational activity into clear reporting for planning, governance, and team
            improvement. With one connected system, leaders spend less time assembling evidence
            and more time acting on it.
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.15}>
          <div className="rounded-2xl border border-border-subtle bg-surface p-6 shadow-card md:p-8">
            <p className="text-sm font-medium text-text-muted">This week</p>
            <div className="mt-6 flex flex-col gap-5">
              {bars.map((bar) => (
                <div key={bar.label}>
                  <div className="mb-1.5 flex items-baseline justify-between text-sm">
                    <span className="font-medium text-text-primary">{bar.label}</span>
                    <span className="text-text-muted">{bar.value}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-accent-primary"
                      style={{ width: `${bar.value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
