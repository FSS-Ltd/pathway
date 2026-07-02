import Link from "next/link";
import { ArrowUpRight, Building2, Church, HeartHandshake, School } from "lucide-react";
import type { SectorDefinition } from "../content/sectors";
import ScrollReveal from "./scroll-reveal";

interface SectorGridProps {
  sectors: SectorDefinition[];
}

const sectorIcons: Record<string, typeof School> = {
  schools: School,
  clubs: Building2,
  churches: Church,
  charities: HeartHandshake,
};

export default function SectorGrid({ sectors }: SectorGridProps) {
  return (
    <section className="bg-muted py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4">
        <ScrollReveal className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-strong">
            Every context
          </span>
          <h2 className="mt-4 text-3xl font-bold text-text-primary md:text-5xl">
            Built for your context
          </h2>
          <p className="mt-4 text-lg text-text-muted">
            See how connected operations adapt to schools, clubs, churches, and charities
          </p>
        </ScrollReveal>

        <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {sectors.map((sector, i) => {
            const Icon = sectorIcons[sector.id] ?? Building2;
            return (
              <ScrollReveal key={sector.id} delay={i * 0.07} className="h-full">
                <Link
                  href={`/${sector.slug}`}
                  className="group flex h-full flex-col rounded-2xl border border-border-subtle bg-surface p-6 shadow-soft transition hover:-translate-y-1 hover:border-accent-primary/50 hover:shadow-card"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-subtle text-accent-strong transition group-hover:bg-accent-primary group-hover:text-text-inverse">
                    <Icon className="h-5 w-5" strokeWidth={2} />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-text-primary">{sector.name}</h3>
                  <p className="mt-2 flex-1 text-sm text-text-muted">{sector.heroSubtitle}</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent-strong">
                    Explore
                    <ArrowUpRight
                      className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      strokeWidth={2}
                    />
                  </span>
                </Link>
              </ScrollReveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
