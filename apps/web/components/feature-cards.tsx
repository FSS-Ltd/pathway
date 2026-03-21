"use client";

import { motion } from "framer-motion";

interface FeatureCard {
  title: string;
  description: string;
}

const features: FeatureCard[] = [
  {
    title: "Attendance",
    description: "Capture registers quickly and keep attendance visible across teams",
  },
  {
    title: "Teams & Scheduling",
    description: "Coordinate staffing, classes, and sessions from one shared plan",
  },
  {
    title: "Family Communication",
    description: "Keep families informed with updates tied to real operational context",
  },
  {
    title: "Safeguarding",
    description: "Support secure care workflows with role-based access and audit trails",
  },
  {
    title: "Reporting",
    description: "Turn day-to-day activity into clear visibility for better decisions",
  },
];

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

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
    },
  },
};

export default function FeatureCards() {
  return (
    <section id="features" className="mx-auto max-w-7xl px-4 py-16 md:py-24">
      <motion.div
        className="rounded-xl border border-border-subtle bg-surface p-8 shadow-soft md:p-12"
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
      >
        <h3 className="mb-8 text-center text-3xl font-bold text-text-primary md:text-4xl">
          Core capabilities
        </h3>
        <p className="mx-auto mb-8 max-w-2xl text-center text-lg text-text-muted">
          Five connected capabilities designed to run operations as one system
        </p>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-xl border border-border-subtle bg-surface p-6 text-center shadow-soft transition hover:border-accent-primary/60 hover:shadow-card md:text-left"
            >
              <h3 className="mb-2 text-xl font-semibold text-text-primary">
                {feature.title}
              </h3>
              <p className="text-sm leading-relaxed text-text-muted">
                {feature.description}
              </p>
            </div>
          ))}
        </div>

        <div className="my-10 border-t border-border-subtle" />

        <h3 className="mb-8 text-center text-3xl font-bold text-text-primary md:text-4xl">
          Value for every role
        </h3>
        <div className="grid gap-8 md:grid-cols-3">
          {roles.map((role) => (
            <div
              key={role.title}
              className="text-center md:text-left"
            >
              <h4 className="mb-2 text-xl font-semibold text-text-primary">{role.title}</h4>
              <p className="text-sm leading-relaxed text-text-muted">{role.description}</p>
            </div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
