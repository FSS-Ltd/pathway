/**
 * Toolkit lead magnet page - token-gated PDF download.
 * Blank templates for attendance, safeguarding, consent, volunteer onboarding.
 */

"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { createToolkitLead } from "../../../lib/leads-client";
import type { CreateToolkitLeadPayload } from "../../../lib/leads-client";
import { getFirstTouchAttribution } from "../../../lib/attribution";
import PageWrapper from "../../../components/page-wrapper";

const TEMPLATES = [
  "Attendance Register Template",
  "Incident/Concern Form Template",
  "Parent/Guardian Consent Template",
  "Volunteer Onboarding Checklist",
  "Weekly Safeguarding Check Checklist",
];

export default function ToolkitPage() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [consent, setConsent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<
    "idle" | "success" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitStatus("idle");
    setErrorMessage("");

    if (!consent) {
      setSubmitStatus("error");
      setErrorMessage("Please agree to be contacted about your download and Nexsteps updates.");
      return;
    }

    setIsSubmitting(true);

    try {
      const attribution = getFirstTouchAttribution();
      const payload: CreateToolkitLeadPayload = {
        email,
        name: name || undefined,
        orgName: orgName || undefined,
        consentMarketing: true,
        utm: attribution?.utm,
      };

      await createToolkitLead(payload);

      setSubmitStatus("success");
      setEmail("");
      setName("");
      setOrgName("");
      setConsent(false);
    } catch (err) {
      setSubmitStatus("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Something went wrong. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageWrapper>
      <div className="mx-auto max-w-2xl px-4 py-16 md:py-24">
        <motion.div
          className="flex flex-col gap-6"
          initial={{ opacity: 1, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="text-4xl font-bold text-text-primary">
            Operations Toolkit
          </h1>
          <p className="text-lg text-text-muted">
            Blank templates to help you run attendance, capture incident and concern records, and stay compliant.
          </p>

          <ul className="space-y-2 text-text-muted">
            {TEMPLATES.map((t) => (
              <li key={t} className="flex items-center gap-2">
                <span className="text-accent-primary">✓</span>
                {t}
              </li>
            ))}
          </ul>

          <p className="text-sm text-text-muted">
            Blank templates. No child details required.
          </p>
        </motion.div>

        <motion.section
          className="mt-10 rounded-xl border border-border-subtle bg-surface p-6 shadow-soft"
          initial={{ opacity: 1, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <h2 className="mb-4 text-xl font-semibold text-text-primary">
            Get Your Toolkit
          </h2>

          {submitStatus === "success" ? (
            <div className="rounded-md bg-status-ok/10 border border-status-ok/20 p-4 text-status-ok">
              <p className="font-medium">Check your email for the download link.</p>
              <p className="text-sm mt-1">
                The link expires in 48 hours. If you don&apos;t see it, check your spam folder.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="email" className="text-sm font-medium text-text-primary">
                  Work email <span className="text-status-danger">*</span>
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rounded-md border border-border-subtle px-3 py-2 text-sm text-text-primary focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                  placeholder="you@yourorg.org"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="name" className="text-sm font-medium text-text-primary">
                  Name
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-md border border-border-subtle px-3 py-2 text-sm text-text-primary focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                  placeholder="Optional"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="orgName" className="text-sm font-medium text-text-primary">
                  Organisation
                </label>
                <input
                  id="orgName"
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  className="rounded-md border border-border-subtle px-3 py-2 text-sm text-text-primary focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                  placeholder="Optional"
                />
              </div>

              <div className="flex items-start gap-2">
                <input
                  id="consent"
                  type="checkbox"
                  required
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-1 rounded border-border-subtle"
                />
                <label
                  htmlFor="consent"
                  className="text-sm text-text-muted cursor-pointer"
                >
                  I agree to be contacted about my download and Nexsteps updates.{" "}
                  <span className="text-status-danger">*</span>
                </label>
              </div>

              {submitStatus === "error" && (
                <div className="rounded-md bg-status-danger/10 border border-status-danger/20 p-3 text-sm text-status-danger">
                  {errorMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-md bg-accent-primary px-6 py-3 text-base font-medium text-white shadow-sm transition hover:bg-accent-strong disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2"
              >
                {isSubmitting ? "Sending..." : "Get Download Link"}
              </button>
            </form>
          )}
        </motion.section>
      </div>
    </PageWrapper>
  );
}
