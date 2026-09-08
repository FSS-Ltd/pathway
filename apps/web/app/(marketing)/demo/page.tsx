"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { createDemoLead } from "../../../lib/leads-client";
import type { CreateDemoLeadPayload } from "../../../lib/leads-client";
import { track } from "../../../lib/analytics";
import { getFirstTouchAttribution } from "../../../lib/attribution";
import PageWrapper from "../../../components/page-wrapper";

const sectors = ["schools", "clubs", "churches", "charities"] as const;
const roles = [
  "School Administrator",
  "Coordinator",
  "Teacher",
  "Staff Member",
  "Other",
] as const;

export default function DemoPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [role, setRole] = useState("");
  const [sector, setSector] = useState("");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<
    "idle" | "success" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState("");

  // Prefill sector from query param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sectorParam = params.get("sector");
    if (sectorParam && (sectors as readonly string[]).includes(sectorParam)) {
      setSector(sectorParam);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitStatus("idle");
    setErrorMessage("");

    if (!consent) {
      setSubmitStatus("error");
      setErrorMessage("Please agree to be contacted");
      return;
    }

    setIsSubmitting(true);

    try {
      const payload: CreateDemoLeadPayload = {
        name,
        email,
        organisation: organisation || undefined,
        role: role || undefined,
        sector: sector || undefined,
        message: message || undefined,
      };

      await createDemoLead(payload);
      
      // Track demo submission
      const attribution = getFirstTouchAttribution();
      track({
        type: "demo_submit",
        sector: sector || null,
        utm: attribution?.utm,
      });
      
      setSubmitStatus("success");
      // Reset form
      setName("");
      setEmail("");
      setOrganisation("");
      setRole("");
      setSector("");
      setMessage("");
      setConsent(false);
    } catch (err) {
      setSubmitStatus("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Something went wrong. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageWrapper>
      <div className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-16 md:py-24">
        <motion.div
          className="flex flex-col gap-4"
          initial={{ opacity: 1, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="text-4xl font-bold text-pw-text">Book a Demo</h1>
          <p className="text-lg text-pw-text-muted">
            See how Nexsteps can help your organisation run attendance, teams,
            family communication, safeguarding, and reporting in one connected system.
            Schedule a demo with our team.
          </p>
        </motion.div>

        <motion.section
          className="rounded-xl border border-pw-border bg-white p-6 shadow-soft"
          initial={{ opacity: 1, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
        <h2 className="mb-4 text-xl font-semibold text-pw-text">Demo Request Form</h2>

        {submitStatus === "success" ? (
          <div className="rounded-md bg-pw-success/10 border border-pw-success/20 p-4 text-pw-success">
            <p className="font-medium">Thanks for your interest!</p>
            <p className="text-sm mt-1">
              We&apos;ll be in touch soon to schedule your demo.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="name" className="text-sm font-medium text-pw-text">
                Name <span className="text-pw-primary">*</span>
              </label>
              <input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-md border border-pw-border px-3 py-2 text-sm text-pw-text focus:border-pw-primary focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="email" className="text-sm font-medium text-pw-text">
                Email <span className="text-pw-primary">*</span>
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-md border border-pw-border px-3 py-2 text-sm text-pw-text focus:border-pw-primary focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label
                htmlFor="organisation"
                className="text-sm font-medium text-pw-text"
              >
                Organisation
              </label>
              <input
                id="organisation"
                type="text"
                value={organisation}
                onChange={(e) => setOrganisation(e.target.value)}
                className="rounded-md border border-pw-border px-3 py-2 text-sm text-pw-text focus:border-pw-primary focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="role" className="text-sm font-medium text-pw-text">
                Role
              </label>
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="rounded-md border border-pw-border px-3 py-2 text-sm text-pw-text focus:border-pw-primary focus:outline-none"
              >
                <option value="">Select a role</option>
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="sector" className="text-sm font-medium text-pw-text">
                Sector
              </label>
              <select
                id="sector"
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                className="rounded-md border border-pw-border px-3 py-2 text-sm text-pw-text focus:border-pw-primary focus:outline-none"
              >
                <option value="">Select a sector</option>
                {sectors.map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="message" className="text-sm font-medium text-pw-text">
                Message (optional)
              </label>
              <textarea
                id="message"
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="rounded-md border border-pw-border px-3 py-2 text-sm text-pw-text focus:border-pw-primary focus:outline-none"
              />
            </div>

            <div className="flex items-start gap-2">
              <input
                id="consent"
                type="checkbox"
                required
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-1 rounded border-pw-border"
              />
              <label
                htmlFor="consent"
                className="text-sm text-pw-text-muted cursor-pointer"
              >
                I agree to be contacted by Nexsteps about this demo request.{" "}
                <span className="text-pw-primary">*</span>
              </label>
            </div>

            {submitStatus === "error" && (
              <div className="rounded-md bg-pw-danger/10 border border-pw-danger/20 p-3 text-sm text-pw-danger">
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-pw-primary px-6 py-3 text-base font-medium text-white shadow-sm transition hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Submitting..." : "Submit Demo Request"}
            </button>
          </form>
        )}
        </motion.section>
      </div>
    </PageWrapper>
  );
}
