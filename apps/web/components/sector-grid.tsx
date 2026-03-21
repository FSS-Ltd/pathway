"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import type { SectorDefinition } from "../content/sectors";

interface SectorGridProps {
  sectors: SectorDefinition[];
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: "easeOut",
    },
  },
};

export default function SectorGrid({ sectors }: SectorGridProps) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 md:py-24">
      <motion.div
        className="mb-12 text-center"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
        <h2 className="mb-4 text-3xl font-bold text-text-primary md:text-4xl">
          Built for your context
        </h2>
        <p className="mx-auto max-w-2xl text-lg text-text-muted">
          See how connected operations adapt to schools, clubs, churches, and charities
        </p>
      </motion.div>

      <motion.div
        className="grid gap-6 md:grid-cols-2 lg:grid-cols-4"
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
      >
        {sectors.map((sector) => (
          <motion.div
            key={sector.id}
            variants={itemVariants}
            whileHover={{ y: -5, transition: { duration: 0.2 } }}
          >
            <Link
              href={`/${sector.slug}`}
              className="flex h-full flex-col rounded-xl border border-border-subtle bg-surface p-6 shadow-soft transition hover:border-accent-primary/60 hover:shadow-card"
            >
              <h3 className="mb-2 text-lg font-semibold text-text-primary">
                {sector.name}
              </h3>
              <p className="flex-1 text-sm text-text-muted">{sector.heroSubtitle}</p>
            </Link>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
