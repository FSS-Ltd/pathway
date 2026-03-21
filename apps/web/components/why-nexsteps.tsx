"use client";

import { motion } from "framer-motion";

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
      <motion.div
        className="rounded-xl border border-border-subtle bg-surface p-8 shadow-soft md:p-12"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
        <motion.h2
          className="mb-8 text-center text-3xl font-bold text-text-primary md:text-4xl"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
        >
          Why organisations switch
        </motion.h2>
        <motion.div
          className="grid gap-8 md:grid-cols-2"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          {features.map((feature) => (
            <motion.div key={feature.title} variants={itemVariants}>
              <h3 className="mb-2 text-xl font-semibold text-text-primary">
                {feature.title}
              </h3>
              <p className="text-sm leading-relaxed text-text-muted">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </motion.div>
    </section>
  );
}
