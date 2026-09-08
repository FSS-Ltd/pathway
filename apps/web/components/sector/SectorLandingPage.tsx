"use client";

import { motion } from "framer-motion";
import { useEffect } from "react";
import Link from "next/link";
import type { SectorDefinition } from "../../content/sectors";
import { track } from "../../lib/analytics";
import { getFirstTouchAttribution } from "../../lib/attribution";
import { configuratorRolloutHref } from "../../lib/configurator-rollout";
import CtaButton from "../cta-button";
import PageWrapper from "../page-wrapper";
import BreadcrumbJsonLd from "../seo/breadcrumb-json-ld";

interface SectorLandingPageProps {
  sector: SectorDefinition;
}

const containerVariants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 1, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: "easeOut",
    },
  },
};

const trustPoints = [
  "Role-based access controls keep sensitive data visible only to authorised staff.",
  "Audit trails log key actions and updates for clearer accountability.",
  "Structured records help teams follow through consistently and safely.",
];

export default function SectorLandingPage({ sector }: SectorLandingPageProps) {
  const fragmentedToolsCopy =
    sector.fragmentedToolsCopy ??
    "Replace disconnected spreadsheets, group chats, separate parent apps, and stand-alone logs with one connected operational workflow.";
  const examplesSectionTitle = sector.examplesSectionTitle ?? `${sector.name} examples`;
  const examples =
    sector.examples && sector.examples.length > 0
      ? sector.examples
      : sector.keyBenefits.slice(0, 3);

  useEffect(() => {
    // Track sector page view
    const attribution = getFirstTouchAttribution();
    const sectorId = sector.id as "schools" | "clubs" | "churches" | "charities";

    track({
      type: "sector_page_view",
      sector: sectorId,
      utm: attribution?.utm,
    });
  }, [sector.id]);

  return (
    <PageWrapper>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", path: "/" },
          { name: sector.name, path: `/${sector.slug}` },
        ]}
      />
      <div className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-16 md:py-24">
        <motion.div
          className="flex flex-col gap-4"
          initial={{ opacity: 1, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="text-4xl font-bold text-pw-text">{sector.heroTitle}</h1>
          <p className="text-lg text-pw-text-muted">{sector.heroSubtitle}</p>
          <div className="flex flex-wrap gap-4">
            <CtaButton
              href={sector.primaryCtaHref}
              location={`sector_${sector.id}_hero`}
              sector={sector.id}
            >
              {sector.primaryCtaLabel}
            </CtaButton>
            <Link
              href={configuratorRolloutHref(sector.secondaryCtaHref)}
              className="rounded-md border border-pw-border bg-white px-6 py-3 text-base font-medium text-pw-text transition hover:bg-pw-surface"
            >
              {sector.secondaryCtaLabel}
            </Link>
          </div>
        </motion.div>

        <motion.section
          className="rounded-xl border border-pw-border bg-white p-6 shadow-soft"
          initial={{ opacity: 1, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <h2 className="mb-4 text-2xl font-semibold text-pw-text">
            Replace fragmented tools
          </h2>
          <p className="leading-relaxed text-pw-text-muted">{fragmentedToolsCopy}</p>
        </motion.section>

        <motion.section
          className="rounded-xl border border-pw-border bg-white p-6 shadow-soft"
          initial={{ opacity: 1, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.25 }}
        >
          <h2 className="mb-4 text-2xl font-semibold text-pw-text">
            {examplesSectionTitle}
          </h2>
          <ul className="flex flex-col gap-3 text-pw-text-muted">
            {examples.map((example, index) => (
              <li key={index}>• {example}</li>
            ))}
          </ul>
        </motion.section>

        <motion.section
          className="rounded-xl border border-pw-border bg-white p-6 shadow-soft"
          initial={{ opacity: 1, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <h2 className="mb-4 text-2xl font-semibold text-pw-text">
            {sector.benefitsSectionTitle || "Key Benefits"}
          </h2>
          <motion.ul
            className="flex flex-col gap-3 text-pw-text-muted"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {sector.keyBenefits.map((benefit, index) => (
              <motion.li key={index} variants={itemVariants}>
                • {benefit}
              </motion.li>
            ))}
          </motion.ul>
        </motion.section>

        <motion.section
          className="rounded-xl border border-pw-border bg-white p-6 shadow-soft"
          initial={{ opacity: 1, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.35 }}
        >
          <h2 className="mb-4 text-2xl font-semibold text-pw-text">
            Safeguarding built in by default
          </h2>
          <ul className="flex flex-col gap-3 text-pw-text-muted">
            {trustPoints.map((point) => (
              <li key={point}>• {point}</li>
            ))}
          </ul>
        </motion.section>

        <motion.section
          className="rounded-xl border border-pw-border bg-white p-6 shadow-soft"
          initial={{ opacity: 1, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          <h2 className="mb-3 text-2xl font-semibold text-pw-text">
            See Nexsteps for {sector.name}
          </h2>
          <p className="mb-5 text-pw-text-muted">
            Explore how connected operations can simplify delivery for your team.
          </p>
          <div className="flex flex-wrap gap-4">
            <CtaButton
              href="/demo"
              location={`sector_${sector.id}_footer_cta`}
              sector={sector.id}
            >
              Book a demo
            </CtaButton>
            <Link
              href={configuratorRolloutHref("/pricing")}
              className="rounded-md border border-pw-border bg-white px-6 py-3 text-base font-medium text-pw-text transition hover:bg-pw-surface"
            >
              View pricing
            </Link>
          </div>
        </motion.section>
      </div>
    </PageWrapper>
  );
}
