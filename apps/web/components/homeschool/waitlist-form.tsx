"use client";

import Link from "next/link";
import { ArrowRight, Check, LockKeyhole } from "lucide-react";
import { useState } from "react";
import { getFirstTouchAttribution } from "../../lib/attribution";
import {
  createHomeschoolLead,
  type HomeschoolRegion,
  type HomeschoolStage,
} from "../../lib/leads-client";
import { homeschoolRegions, homeschoolStages } from "./homeschool-content";

type SubmissionStatus = "idle" | "submitting" | "success" | "error";

const fieldClassName =
  "min-h-12 w-full rounded-xl border border-[#b6c8c3] bg-white px-4 text-base text-[#263531] outline-none transition placeholder:text-[#75847f] focus:border-[#147b68] focus:ring-4 focus:ring-[#76D7C4]/25";

export default function WaitlistForm() {
  const [status, setStatus] = useState<SubmissionStatus>("idle");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");

    const form = event.currentTarget;
    const data = new FormData(form);
    const attribution = getFirstTouchAttribution();

    try {
      await createHomeschoolLead({
        firstName: String(data.get("firstName") ?? ""),
        email: String(data.get("email") ?? ""),
        region: String(data.get("region")) as HomeschoolRegion,
        stage: String(data.get("stage")) as HomeschoolStage,
        consentMarketing: true,
        utm: attribution?.utm,
      });
      setStatus("success");
      form.reset();
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div
        className="flex min-h-[32rem] flex-col justify-between rounded-[2rem] bg-[#dff3ed] p-7 text-[#263531] sm:p-10"
        role="status"
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#76D7C4]">
          <Check className="h-7 w-7" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#357267]">
            You are on the list
          </p>
          <h3 className="mt-4 font-heading text-4xl font-bold leading-tight sm:text-5xl">
            We will keep your place.
          </h3>
          <p className="mt-5 max-w-md text-lg leading-8 text-[#4f6862]">
            Thanks for helping shape NexSteps Home. We will email you with thoughtful product updates
            and early-access news.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[2rem] bg-[#f4f1e8] p-6 text-[#263531] sm:p-9"
      aria-describedby="waitlist-privacy waitlist-status"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="homeschool-first-name" className="mb-2 block text-sm font-bold">
            First name
          </label>
          <input
            id="homeschool-first-name"
            name="firstName"
            type="text"
            autoComplete="given-name"
            required
            maxLength={100}
            className={fieldClassName}
            placeholder="Sam"
          />
        </div>
        <div>
          <label htmlFor="homeschool-email" className="mb-2 block text-sm font-bold">
            Email address
          </label>
          <input
            id="homeschool-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className={fieldClassName}
            placeholder="sam@example.com"
          />
        </div>
        <div>
          <label htmlFor="homeschool-region" className="mb-2 block text-sm font-bold">
            Where are you based?
          </label>
          <select
            id="homeschool-region"
            name="region"
            required
            defaultValue=""
            className={fieldClassName}
          >
            <option value="" disabled>
              Choose a nation or region
            </option>
            {homeschoolRegions.map((region) => (
              <option key={region.value} value={region.value}>
                {region.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="homeschool-stage" className="mb-2 block text-sm font-bold">
            Where are you in the journey?
          </label>
          <select
            id="homeschool-stage"
            name="stage"
            required
            defaultValue=""
            className={fieldClassName}
          >
            <option value="" disabled>
              Choose the closest answer
            </option>
            {homeschoolStages.map((stage) => (
              <option key={stage.value} value={stage.value}>
                {stage.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-xl border border-[#cbd6d2] bg-white p-4 text-sm leading-6">
        <input
          name="consentMarketing"
          type="checkbox"
          required
          className="mt-1 h-5 w-5 shrink-0 rounded border-[#8fa39d] text-[#147b68] focus:ring-[#147b68]"
        />
        <span>
          I agree to receive NexSteps Home product updates and early-access news. I can unsubscribe
          at any time.
        </span>
      </label>

      <div id="waitlist-privacy" className="mt-5 flex items-start gap-2 text-sm text-[#5c6f69]">
        <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          We only ask about you and never request children&apos;s personal details. Read our{" "}
          <Link href="/privacy" className="font-bold underline underline-offset-4">
            privacy policy
          </Link>
          .
        </p>
      </div>

      <div id="waitlist-status" aria-live="polite" className="mt-5 min-h-6 text-sm font-bold">
        {status === "error" ? (
          <p className="text-[#a6293d]">
            We could not save your place just now. Your details are still here, so please try again.
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={status === "submitting"}
        className="mt-3 inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-full bg-[#263531] px-7 text-base font-bold text-white transition hover:bg-[#147b68] disabled:cursor-wait disabled:opacity-65"
      >
        {status === "submitting" ? "Saving your place..." : "Join the waiting list"}
        {status === "submitting" ? null : <ArrowRight className="h-5 w-5" aria-hidden="true" />}
      </button>
    </form>
  );
}
