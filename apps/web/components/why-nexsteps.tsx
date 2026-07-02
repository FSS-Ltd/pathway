import ScrollReveal from "./scroll-reveal";

const features = [
  {
    index: "01",
    title: "Spreadsheets hide what is really happening",
    description:
      "Critical attendance, scheduling, and care details end up split across tabs and versions.",
  },
  {
    index: "02",
    title: "Group chats are fast, but not operationally reliable",
    description:
      "Important updates get buried, duplicated, or lost when teams coordinate only in chat threads.",
  },
  {
    index: "03",
    title: "Separate parent apps and admin tools create extra friction",
    description:
      "Staff and families see different versions of reality, which creates unnecessary follow-up work.",
  },
  {
    index: "04",
    title: "Disconnected logs make decisions slower",
    description:
      "When evidence lives in multiple places, leaders spend more time collecting context than acting on it.",
  },
];

export default function WhyNexsteps() {
  return (
    <section className="relative overflow-hidden bg-slate-950 py-20 md:py-28">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-40 top-0 h-[480px] w-[480px] rounded-full bg-accent-primary/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 bottom-0 h-[420px] w-[420px] rounded-full bg-accent-secondary/10 blur-3xl"
      />
      <div className="relative mx-auto max-w-6xl px-4">
        <ScrollReveal className="max-w-2xl">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-secondary">
            The problem
          </span>
          <h2 className="mt-4 text-3xl font-bold text-white md:text-5xl">
            Why organisations switch
          </h2>
        </ScrollReveal>

        <div className="mt-14 grid gap-x-12 gap-y-14 md:grid-cols-2">
          {features.map((feature, i) => (
            <ScrollReveal key={feature.title} delay={i * 0.08}>
              <span className="text-sm font-bold tracking-widest text-accent-primary">
                {feature.index}
              </span>
              <h3 className="mt-3 text-xl font-semibold text-white md:text-2xl">
                {feature.title}
              </h3>
              <p className="mt-3 max-w-md text-base leading-relaxed text-slate-400">
                {feature.description}
              </p>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
