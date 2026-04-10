import Link from "next/link";
import CtaButton from "./cta-button";

export default function HeroSection() {
  return (
    <section className="mx-auto flex max-w-7xl flex-col items-center gap-10 px-4 py-16 md:flex-row md:py-24">
      <div className="flex flex-1 flex-col text-center md:text-left">
        <h1 className="mb-4 text-4xl font-bold text-text-primary md:text-5xl lg:text-6xl">
          Run attendance, teams, family communication, and safeguarding in one place.
        </h1>
        <p className="mb-6 text-lg leading-relaxed text-text-muted md:text-xl">
          Nexsteps helps schools, clubs, and churches stay organised, connected, and in sync.
        </p>
        <div className="flex flex-wrap justify-center gap-4 md:justify-start">
          <CtaButton href="/demo" location="home_hero" variant="primary">
            Book a demo
          </CtaButton>
          <Link
            href="/features/attendance"
            className="rounded-md border border-border-subtle bg-surface px-6 py-3 text-base font-medium text-text-primary transition hover:bg-muted"
          >
            See how Nexsteps works
          </Link>
        </div>
      </div>

      <div className="flex w-full flex-1 items-center justify-center">
        <div className="w-full max-w-md rounded-2xl border border-border-subtle bg-surface p-6 shadow-soft">
          <h2 className="text-lg font-semibold text-text-primary">Mobile-first operations</h2>
          <p className="mt-2 text-sm text-text-muted">
            Keep daily attendance, updates, and safeguarding actions visible without switching
            between disconnected tools.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-text-muted">
            <li>• Fast session check-ins</li>
            <li>• Clear staff coordination</li>
            <li>• Better family visibility</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
