"use client";

import { useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { track } from "../../../lib/analytics";
import { getFirstTouchAttribution } from "../../../lib/attribution";
import PageWrapper from "../../../components/page-wrapper";
import { getTotalSteps } from "../../../lib/readiness-quiz";

export default function ReadinessScoreStartPage() {
  useEffect(() => {
    const attribution = getFirstTouchAttribution();
    track({
      type: "readiness_start",
      utm: attribution?.utm,
    });
  }, []);

  const totalSteps = getTotalSteps();

  return (
    <PageWrapper>
      <div className="mx-auto max-w-[1120px] px-4 py-12 sm:px-6 sm:py-16 md:px-8 md:py-20">
        <motion.div
          className="flex flex-col gap-6 text-center"
          initial={{ opacity: 1, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="text-3xl font-bold text-text-primary sm:text-4xl md:text-5xl">
            Operations & Safeguarding Readiness Score
          </h1>
          <p className="text-lg text-text-muted sm:text-xl">
            A 3-minute assessment to highlight risk areas and next steps.
          </p>
          <p className="text-text-muted">
            Get a score, a simple impact estimate, and a recommended plan based
            on your answers.
          </p>
        </motion.div>

        <motion.div
          className="mt-8 flex flex-wrap justify-center gap-6 text-sm text-text-muted"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <span className="flex items-center gap-2">
            <span className="text-accent-primary">✓</span>
            GDPR-aware (no child names needed)
          </span>
          <span className="flex items-center gap-2">
            <span className="text-accent-primary">✓</span>
            Takes ~3 minutes
          </span>
          <span className="flex items-center gap-2">
            <span className="text-accent-primary">✓</span>
            Instant results
          </span>
        </motion.div>

        <motion.div
          className="mt-12 flex justify-center"
          initial={{ opacity: 1, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <Link
            href="/readiness-score/step/1"
            className="rounded-md bg-accent-primary px-8 py-4 text-lg font-semibold text-white shadow-sm transition hover:bg-accent-strong focus-visible:outline focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2"
          >
            Start Assessment
          </Link>
        </motion.div>

        <p className="mt-6 text-center text-sm text-text-muted">
          {totalSteps} questions · approximately 3 minutes
        </p>
      </div>
    </PageWrapper>
  );
}
