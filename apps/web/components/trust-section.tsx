import { Eye, Lock, ShieldCheck } from "lucide-react";
import ScrollReveal from "./scroll-reveal";

const trustPoints = [
  {
    title: "Built in, not bolted on",
    description: "Safeguarding is a foundation of the system, not a separate tool to maintain.",
    icon: ShieldCheck,
  },
  {
    title: "Role-based access",
    description: "Sensitive information is visible only to the people who need to see it.",
    icon: Lock,
  },
  {
    title: "Full audit trails",
    description: "Every key action and update is accountable, so nothing goes unrecorded.",
    icon: Eye,
  },
];

export default function TrustSection() {
  return (
    <section className="relative overflow-hidden bg-slate-950 py-20 md:py-28">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-accent-primary/10 blur-3xl"
      />
      <div className="relative mx-auto max-w-6xl px-4">
        <ScrollReveal className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-secondary">
            Trust
          </span>
          <h2 className="mt-4 text-3xl font-bold text-white md:text-5xl">
            Safeguarding and trust, built in
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-slate-400">
            Nexsteps supports safer operations through built-in controls, clearer visibility,
            and consistent handling of sensitive workflows.
          </p>
        </ScrollReveal>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {trustPoints.map((point, i) => (
            <ScrollReveal key={point.title} delay={i * 0.08}>
              <div className="h-full rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-primary/20 text-accent-primary">
                  <point.icon className="h-5 w-5" strokeWidth={2} />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-white">{point.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  {point.description}
                </p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
