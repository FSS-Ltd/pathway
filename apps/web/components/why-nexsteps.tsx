const features = [
  {
    title: "Spreadsheets hide what is really happening",
    description:
      "Critical attendance, scheduling, and care details end up split across tabs and versions.",
  },
  {
    title: "Group chats are fast, but not operationally reliable",
    description:
      "Important updates get buried, duplicated, or lost when teams coordinate only in chat threads.",
  },
  {
    title: "Separate parent apps and admin tools create extra friction",
    description:
      "Staff and families see different versions of reality, which creates unnecessary follow-up work.",
  },
  {
    title: "Disconnected logs make decisions slower",
    description:
      "When evidence lives in multiple places, leaders spend more time collecting context than acting on it.",
  },
];

export default function WhyNexsteps() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 md:py-24">
      <div className="rounded-xl border border-border-subtle bg-surface p-8 shadow-soft md:p-12">
        <h2 className="mb-8 text-center text-3xl font-bold text-text-primary md:text-4xl">
          Why organisations switch
        </h2>
        <div className="grid gap-8 md:grid-cols-2">
          {features.map((feature) => (
            <div key={feature.title}>
              <h3 className="mb-2 text-xl font-semibold text-text-primary">{feature.title}</h3>
              <p className="text-sm leading-relaxed text-text-muted">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
