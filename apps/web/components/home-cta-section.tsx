import Link from "next/link";
import CtaButton from "./cta-button";
import ScrollReveal from "./scroll-reveal";

export default function HomeCtaSection() {
  return (
    <section className="relative overflow-hidden bg-slate-950 py-24 md:py-32">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_rgba(23,184,158,0.22),_transparent_60%)]"
      />
      <div className="relative mx-auto max-w-4xl px-4 text-center">
        <ScrollReveal>
          <h2 className="text-3xl font-bold text-white md:text-5xl">
            Ready to run operations from one connected system?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-300">
            See how Nexsteps helps your team stay aligned across attendance, scheduling, family
            communication, safeguarding, and reporting.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <CtaButton href="/demo" location="home_final_cta" variant="primary">
              Book a demo
            </CtaButton>
            <Link
              href="/pricing"
              className="rounded-md border border-white/25 bg-white/10 px-6 py-3 text-base font-medium text-white backdrop-blur transition hover:bg-white/20"
            >
              View pricing
            </Link>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
