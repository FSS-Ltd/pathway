"use client";

import { motion } from "framer-motion";

const trustPoints = [
  "Safeguarding is built in as a foundation, not bolted on as a separate tool.",
  "Role-based access controls help ensure sensitive information is viewed only by the right people.",
  "Audit trails provide operational accountability for key actions and updates.",
];

export default function TrustSection() {
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
          Safeguarding and trust, built in
        </h2>
        <p className="mb-6 max-w-3xl text-lg text-text-muted">
          Nexsteps supports safer operations through built-in controls, clearer visibility,
          and consistent handling of sensitive workflows.
        </p>
        <ul className="flex flex-col gap-3 text-text-muted">
          {trustPoints.map((point) => (
            <li key={point}>• {point}</li>
          ))}
        </ul>
      </motion.div>
    </section>
  );
}
