"use client";

import { motion } from "framer-motion";

const roles = [
  {
    title: "Leaders",
    description:
      "Get a clear operational picture across attendance, staffing, communication, and care without manual reporting cycles.",
  },
  {
    title: "Staff & team leaders",
    description:
      "Work from one connected flow for sessions, updates, and follow-up so less time is spent coordinating across tools.",
  },
  {
    title: "Parents & families",
    description:
      "Receive clearer communication and more consistent updates because teams are working from shared operational context.",
  },
];

export default function RoleBasedValueSection() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 md:py-24">
      <motion.div
        className="rounded-xl border border-border-subtle bg-surface p-8 shadow-soft md:p-12"
        initial={{ opacity: 1, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
        <h2 className="mb-8 text-center text-3xl font-bold text-text-primary md:text-4xl">
          Value for every role
        </h2>
        <div className="grid gap-8 md:grid-cols-3">
          {roles.map((role) => (
            <div key={role.title}>
              <h3 className="mb-2 text-xl font-semibold text-text-primary">{role.title}</h3>
              <p className="text-sm leading-relaxed text-text-muted">{role.description}</p>
            </div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
