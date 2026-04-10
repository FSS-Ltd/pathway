import Link from "next/link";
import type { SectorDefinition } from "../content/sectors";

interface SectorGridProps {
  sectors: SectorDefinition[];
}

export default function SectorGrid({ sectors }: SectorGridProps) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 md:py-24">
      <div className="mb-12 text-center">
        <h2 className="mb-4 text-3xl font-bold text-text-primary md:text-4xl">
          Built for your context
        </h2>
        <p className="mx-auto max-w-2xl text-lg text-text-muted">
          See how connected operations adapt to schools, clubs, churches, and charities
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {sectors.map((sector) => (
          <Link
            key={sector.id}
            href={`/${sector.slug}`}
            className="flex h-full flex-col rounded-xl border border-border-subtle bg-surface p-6 shadow-soft transition hover:border-accent-primary/60 hover:shadow-card"
          >
            <h3 className="mb-2 text-lg font-semibold text-text-primary">{sector.name}</h3>
            <p className="flex-1 text-sm text-text-muted">{sector.heroSubtitle}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
