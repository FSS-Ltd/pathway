"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import CtaButton from "./cta-button";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: "easeOut",
    },
  },
};

const graphicVariants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.8,
      ease: "easeOut",
    },
  },
};

export default function HeroSection() {
  return (
    <section className="mx-auto flex max-w-7xl flex-col items-center gap-12 px-4 py-16 md:flex-row md:py-24">
      {/* Hero Content */}
      <motion.div
        className="flex flex-1 flex-col text-center md:text-left"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.h1
          className="mb-4 text-4xl font-bold text-text-primary md:text-5xl lg:text-6xl"
          variants={itemVariants}
        >
          Run attendance, teams, family communication, and safeguarding in one place.
        </motion.h1>
        <motion.p
          className="mb-6 text-lg leading-relaxed text-text-muted md:text-xl"
          variants={itemVariants}
        >
          Nexsteps helps schools, clubs, and churches stay organised, connected,
          and in sync.
        </motion.p>
        <motion.div
          className="flex flex-wrap justify-center gap-4 md:justify-start"
          variants={itemVariants}
        >
          <CtaButton href="/demo" location="home_hero" variant="primary">
            Book a demo
          </CtaButton>
          <Link
            href="/features/attendance"
            className="rounded-md border border-border-subtle bg-surface px-6 py-3 text-base font-medium text-text-primary transition hover:bg-muted"
          >
            See how Nexsteps works
          </Link>
        </motion.div>
      </motion.div>

      {/* Hero Graphic */}
      <motion.div
        className="relative flex flex-1 items-center justify-center w-full"
        variants={graphicVariants}
        initial="hidden"
        animate="visible"
      >
        <div className="relative mx-auto h-[300px] w-full max-w-sm md:h-[400px] md:max-w-md">
          {/* Background gradient layer */}
          <motion.div
            className="absolute inset-0 z-0 rounded-2xl bg-gradient-to-br from-accent-primary/30 via-accent-primary/20 to-accent-secondary/30"
            animate={{
              scale: [1, 1.05, 1],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            style={{ willChange: "transform" }}
          />
          {/* Phone mockup card */}
          <motion.div
            className="absolute inset-4 z-10 flex items-center justify-center rounded-xl bg-surface shadow-card"
            animate={{
              y: [0, -10, 0],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            style={{ willChange: "transform" }}
          >
            <div className="text-center">
              <div className="mb-4 text-6xl">📱</div>
              <p className="text-sm font-medium text-text-muted">
                Mobile
              </p>
              <p className="text-sm font-medium text-text-muted">
                app
              </p>
              <p className="text-sm font-medium text-text-muted">
                preview
              </p>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </section>
  );
}
