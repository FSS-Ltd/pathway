"use client";

import { motion } from "framer-motion";

export default function ReportingVisibilitySection() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 md:py-24">
      <motion.div
        className="rounded-xl border border-border-subtle bg-surface p-8 shadow-soft md:p-12"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
        <h2 className="mb-4 text-3xl font-bold text-text-primary md:text-4xl">
          Reporting and visibility without the spreadsheet chase
        </h2>
        <p className="max-w-3xl text-lg leading-relaxed text-text-muted">
          Turn operational activity into clear reporting for planning, governance,
          and team improvement. With one connected system, leaders spend less time
          assembling evidence and more time acting on it.
        </p>
      </motion.div>
    </section>
  );
}
