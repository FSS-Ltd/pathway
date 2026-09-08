"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { track } from "../../../../lib/analytics";
import { getFirstTouchAttribution } from "../../../../lib/attribution";
import { createReadinessLead } from "../../../../lib/leads-client";
import { configuratorRolloutHref } from "../../../../lib/configurator-rollout";
import PageWrapper from "../../../../components/page-wrapper";
import {
  QUIZ_STORAGE_KEY,
  computeScore,
  getBand,
  getRiskAreas,
  getRecommendedPlan,
  type QuizAnswers,
} from "../../../../lib/readiness-quiz";

function loadAnswers(): QuizAnswers {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(QUIZ_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as QuizAnswers;
    return typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function clearAnswers() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(QUIZ_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export default function ReadinessScoreResultsPage() {
  const [answers, setAnswers] = useState<QuizAnswers>({});
  const [mounted, setMounted] = useState(false);

  const [leadForm, setLeadForm] = useState({
    name: "",
    email: "",
    org: "",
    sector: "",
    consent: false,
  });
  const [leadSubmitStatus, setLeadSubmitStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [leadError, setLeadError] = useState("");

  const [hourlyCost, setHourlyCost] = useState(15);

  useEffect(() => {
    setAnswers(loadAnswers());
    setMounted(true);
  }, []);

  const score = computeScore(answers);
  const band = getBand(score);
  const riskAreas = getRiskAreas(answers);
  const recommendedPlan = getRecommendedPlan(answers);
  const pricingHref = configuratorRolloutHref("/pricing");

  const adminHours = (answers.admin_time_hours as number) ?? 2;
  const weeklyCost = adminHours * hourlyCost;
  const monthlyCost = Math.round(weeklyCost * 4.33);

  useEffect(() => {
    if (mounted) {
      const attribution = getFirstTouchAttribution();
      track({
        type: "readiness_complete",
        score,
        band,
        utm: attribution?.utm,
      });
      track({
        type: "readiness_result_view",
        score,
        band,
        utm: attribution?.utm,
      });
    }
  }, [mounted, score, band]);

  const handleCtaClick = useCallback((destination: string) => {
    const attribution = getFirstTouchAttribution();
    track({
      type: "readiness_cta_click",
      location: "results",
      destination,
      utm: attribution?.utm,
    });
  }, []);

  const handleLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLeadSubmitStatus("idle");
    setLeadError("");

    if (!leadForm.consent) {
      setLeadSubmitStatus("error");
      setLeadError("Please agree to be contacted about your results.");
      return;
    }

    if (!leadForm.name.trim() || !leadForm.email.trim()) {
      setLeadSubmitStatus("error");
      setLeadError("Name and email are required.");
      return;
    }

    setLeadSubmitStatus("submitting");

    try {
      const attribution = getFirstTouchAttribution();
      await createReadinessLead({
        name: leadForm.name.trim(),
        email: leadForm.email.trim(),
        organisation: leadForm.org.trim() || undefined,
        sector: leadForm.sector || undefined,
        answers,
        score,
        band,
        riskAreas: riskAreas.map((r) => ({
          area: r.area,
          severity: r.severity,
          notes: r.copy,
        })),
        utm: attribution?.utm,
      });

      track({
        type: "readiness_lead_submit",
        utm: attribution?.utm,
      });

      setLeadSubmitStatus("success");
      clearAnswers();
    } catch (err) {
      setLeadSubmitStatus("error");
      setLeadError(
        err instanceof Error ? err.message : "Something went wrong. Please try again."
      );
    }
  };

  if (!mounted) {
    return (
      <PageWrapper>
        <div className="mx-auto max-w-[1120px] px-4 py-12">
          <div className="animate-pulse rounded-xl bg-muted p-8">Loading results...</div>
        </div>
      </PageWrapper>
    );
  }

  const bandStyles = {
    "High risk": "bg-status-danger/10 border-status-danger/30 text-status-danger",
    Developing: "bg-status-warn/10 border-status-warn/30 text-status-warn",
    Strong: "bg-status-ok/10 border-status-ok/30 text-status-ok",
  };

  return (
    <PageWrapper>
      <div className="mx-auto max-w-[1120px] px-4 py-8 sm:px-6 sm:py-12 md:px-8 md:py-16">
        <div className="grid gap-10 lg:grid-cols-[1fr_380px]">
          <div className="min-w-0 space-y-8">
            <motion.section
              className="rounded-[20px] border border-border-subtle bg-surface p-6 shadow-soft sm:p-8"
              initial={{ opacity: 1, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="mb-2 text-xl font-semibold text-text-primary">
                Your Readiness Score
              </h2>
              <p className="mb-6 text-sm text-text-muted">
                This is a snapshot based on your answers.
              </p>

              <div className="flex items-center gap-6">
                <div
                  className={`flex h-24 w-24 flex-shrink-0 items-center justify-center rounded-2xl border-2 text-3xl font-bold ${bandStyles[band]}`}
                >
                  {score}
                </div>
                <div>
                  <p className="text-lg font-semibold text-text-primary">{band}</p>
                  <p className="text-sm text-text-muted">Out of 100</p>
                </div>
              </div>
            </motion.section>

            {riskAreas.length > 0 && (
              <motion.section
                className="space-y-4"
                initial={{ opacity: 1, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
              >
                <h2 className="text-xl font-semibold text-text-primary">
                  Risk Areas to Address
                </h2>
                <div className="space-y-4">
                  {riskAreas.map((r) => (
                    <div
                      key={r.area}
                      className="rounded-xl border border-border-subtle bg-surface p-6 shadow-soft"
                    >
                      <h3 className="mb-2 font-semibold text-text-primary">{r.area}</h3>
                      <p className="mb-4 text-sm text-text-muted">{r.copy}</p>
                      <ul className="list-inside list-disc space-y-1 text-sm text-text-muted">
                        {r.nextSteps.map((step, i) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </motion.section>
            )}
          </div>

          <aside className="space-y-6">
            <motion.section
              className="rounded-xl border border-border-subtle bg-surface p-6 shadow-soft"
              initial={{ opacity: 1, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15 }}
            >
              <h2 className="mb-4 text-lg font-semibold text-text-primary">
                What It May Be Costing You
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-text-primary">
                    Admin time per week
                  </label>
                  <p className="text-2xl font-bold text-text-primary">
                    {adminHours} <span className="text-base font-normal text-text-muted">hours</span>
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-text-primary">
                    Estimated hourly cost (optional)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={hourlyCost}
                    onChange={(e) => setHourlyCost(Number(e.target.value) || 15)}
                    className="w-full rounded-md border border-border-subtle px-3 py-2 text-sm text-text-primary focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                  />
                  <span className="ml-2 text-sm text-text-muted">£/hour</span>
                </div>
                <div className="border-t border-border-subtle pt-4">
                  <p className="text-sm text-text-muted">
                    Estimated time cost per week:{" "}
                    <span className="font-semibold text-text-primary">£{weeklyCost}</span>
                  </p>
                  <p className="mt-1 text-sm text-text-muted">
                    Estimated time cost per month:{" "}
                    <span className="font-semibold text-text-primary">£{monthlyCost}</span>
                  </p>
                </div>
                <p className="text-xs text-text-muted">
                  This is an estimate to help quantify the operational drag.
                </p>
              </div>
            </motion.section>

            <motion.section
              className="rounded-xl border border-border-subtle bg-surface p-6 shadow-soft"
              initial={{ opacity: 1, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <h2 className="mb-2 text-lg font-semibold text-text-primary">
                Recommended Plan
              </h2>
              <p className="mb-4 text-sm text-text-muted">{recommendedPlan.why}</p>
              <div className="mb-6 rounded-lg border border-accent-subtle bg-accent-subtle/30 p-4">
                <h3 className="font-semibold text-text-primary">
                  {recommendedPlan.displayName}
                </h3>
                <p className="text-sm text-text-muted">{recommendedPlan.tagline}</p>
              </div>
              <div className="flex flex-col gap-3">
                <Link
                  href="/demo?source=readiness"
                  onClick={() => handleCtaClick("/demo?source=readiness")}
                  className="rounded-md bg-accent-primary px-6 py-3 text-center font-medium text-white shadow-sm transition hover:bg-accent-strong focus-visible:outline focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2"
                >
                  Get Your Tailored Rollout Plan (free)
                </Link>
                <Link
                  href={pricingHref}
                  onClick={() => handleCtaClick(pricingHref)}
                  className="rounded-md border border-border-subtle bg-surface px-6 py-3 text-center font-medium text-text-primary transition hover:bg-muted focus-visible:outline focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2"
                >
                  View Pricing
                </Link>
              </div>
            </motion.section>

            <motion.section
              className="rounded-xl border border-border-subtle bg-surface p-6 shadow-soft"
              initial={{ opacity: 1, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.25 }}
            >
              <h2 className="mb-4 text-lg font-semibold text-text-primary">
                Get Your Results Delivered
              </h2>

              {leadSubmitStatus === "success" ? (
                <div className="rounded-md bg-status-ok/10 border border-status-ok/20 p-4 text-status-ok">
                  <p className="font-medium">Thanks!</p>
                  <p className="text-sm mt-1">
                    We&apos;ll be in touch soon with your tailored rollout plan.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleLeadSubmit} className="space-y-4">
                  <div>
                    <label
                      htmlFor="lead-name"
                      className="mb-1 block text-sm font-medium text-text-primary"
                    >
                      Name <span className="text-status-danger">*</span>
                    </label>
                    <input
                      id="lead-name"
                      type="text"
                      required
                      value={leadForm.name}
                      onChange={(e) =>
                        setLeadForm((prev) => ({ ...prev, name: e.target.value }))
                      }
                      className="w-full rounded-md border border-border-subtle px-3 py-2 text-sm text-text-primary focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="lead-email"
                      className="mb-1 block text-sm font-medium text-text-primary"
                    >
                      Work email <span className="text-status-danger">*</span>
                    </label>
                    <input
                      id="lead-email"
                      type="email"
                      required
                      value={leadForm.email}
                      onChange={(e) =>
                        setLeadForm((prev) => ({ ...prev, email: e.target.value }))
                      }
                      className="w-full rounded-md border border-border-subtle px-3 py-2 text-sm text-text-primary focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="lead-org"
                      className="mb-1 block text-sm font-medium text-text-primary"
                    >
                      Organisation
                    </label>
                    <input
                      id="lead-org"
                      type="text"
                      value={leadForm.org}
                      onChange={(e) =>
                        setLeadForm((prev) => ({ ...prev, org: e.target.value }))
                      }
                      className="w-full rounded-md border border-border-subtle px-3 py-2 text-sm text-text-primary focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="lead-sector"
                      className="mb-1 block text-sm font-medium text-text-primary"
                    >
                      Sector
                    </label>
                    <select
                      id="lead-sector"
                      value={leadForm.sector}
                      onChange={(e) =>
                        setLeadForm((prev) => ({ ...prev, sector: e.target.value }))
                      }
                      className="w-full rounded-md border border-border-subtle px-3 py-2 text-sm text-text-primary focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                    >
                      <option value="">Select</option>
                      <option value="School">School</option>
                      <option value="Club">Club</option>
                      <option value="Church">Church</option>
                      <option value="Charity">Charity</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="flex items-start gap-2">
                    <input
                      id="lead-consent"
                      type="checkbox"
                      required
                      checked={leadForm.consent}
                      onChange={(e) =>
                        setLeadForm((prev) => ({ ...prev, consent: e.target.checked }))
                      }
                      className="mt-1 rounded border-border-subtle"
                    />
                    <label
                      htmlFor="lead-consent"
                      className="text-sm text-text-muted cursor-pointer"
                    >
                      I agree to be contacted about my results.{" "}
                      <span className="text-status-danger">*</span>
                    </label>
                  </div>
                  {leadSubmitStatus === "error" && (
                    <p className="text-sm text-status-danger">{leadError}</p>
                  )}
                  <button
                    type="submit"
                    disabled={leadSubmitStatus === "submitting"}
                    className="w-full rounded-md bg-accent-primary px-6 py-3 font-medium text-white shadow-sm transition hover:bg-accent-strong disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2"
                  >
                    {leadSubmitStatus === "submitting" ? "Submitting..." : "Submit"}
                  </button>
                </form>
              )}
            </motion.section>
          </aside>
        </div>

        <div className="mt-12 flex justify-center gap-4">
          <Link
            href="/readiness-score"
            className="text-sm text-text-muted hover:text-accent-primary"
          >
            Start over
          </Link>
          <span className="text-text-muted">·</span>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(window.location.href);
            }}
            className="text-sm text-text-muted hover:text-accent-primary"
          >
            Copy link
          </button>
        </div>
      </div>
    </PageWrapper>
  );
}
