"use client";

import { FormEvent, useEffect, useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { createTeamTrackerLead, type CreateTeamTrackerLeadPayload } from "../../lib/leads-client";
import { track } from "../../lib/analytics";
import { getFirstTouchAttribution } from "../../lib/attribution";

type FormState = Omit<CreateTeamTrackerLeadPayload, "utm">;

const initialState: FormState = {
  name: "",
  email: "",
  organisationType: "school",
  role: "leader",
  teamSize: undefined,
  currentTools: undefined,
  consentMarketing: false,
};

export default function TeamTrackerForm() {
  const [form, setForm] = useState<FormState>(initialState);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "success" && downloadUrl) {
      window.location.assign(downloadUrl);
    }
  }, [downloadUrl, status]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("submitting");
    setError("");

    try {
      const attribution = getFirstTouchAttribution();
      const result = await createTeamTrackerLead({
        ...form,
        name: form.name.trim(),
        email: form.email.trim(),
        utm: attribution?.utm,
      });
      track({
        type: "team_tracker_form_submit",
        organisationType: form.organisationType,
        role: form.role,
        marketingOptIn: form.consentMarketing,
        utm: attribution?.utm,
      });
      track({ type: "team_tracker_download", utm: attribution?.utm });
      setDownloadUrl(result.downloadUrl);
      setStatus("success");
    } catch (cause) {
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "We could not prepare the tracker. Please try again.");
    }
  };

  if (status === "success") {
    return (
      <div className="rounded-2xl bg-white p-7 text-[#112035] shadow-[0_24px_80px_rgba(0,0,0,0.24)] sm:p-9">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#e8f5f1] text-[#149b7e]"><Download className="h-6 w-6" /></div>
        <h3 className="mt-5 text-2xl font-bold">Your tracker is downloading.</h3>
        <p className="mt-3 leading-relaxed text-slate-600">We have also sent a copy to your inbox. Start with the tab matching your role, then replace or delete the yellow example row.</p>
        {downloadUrl ? <a href={downloadUrl} className="mt-6 inline-flex font-bold text-[#149b7e] underline underline-offset-4">Download again if it did not start</a> : null}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-2xl bg-white p-6 text-[#112035] shadow-[0_24px_80px_rgba(0,0,0,0.24)] sm:p-8" noValidate>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-2xl font-bold tracking-[-0.03em]">Get the free tracker</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">Four required fields. No payment details.</p>
        </div>
        <Download className="h-6 w-6 text-[#149b7e]" aria-hidden="true" />
      </div>
      <div className="mt-7 grid gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="tracker-name">
          <input id="tracker-name" required value={form.name} onChange={(event) => update("name", event.target.value)} autoComplete="given-name" className="form-input" />
        </Field>
        <Field label="Work email" htmlFor="tracker-email">
          <input id="tracker-email" type="email" required value={form.email} onChange={(event) => update("email", event.target.value)} autoComplete="email" className="form-input" />
        </Field>
        <Field label="Organisation type" htmlFor="tracker-organisation-type">
          <select id="tracker-organisation-type" value={form.organisationType} onChange={(event) => update("organisationType", event.target.value as FormState["organisationType"])} className="form-input">
            <option value="school">School</option><option value="youth_group_or_church">Youth group or church</option><option value="club">Club</option><option value="charity">Charity</option><option value="other">Other</option>
          </select>
        </Field>
        <Field label="Your role" htmlFor="tracker-role">
          <select id="tracker-role" value={form.role} onChange={(event) => update("role", event.target.value as FormState["role"])} className="form-input">
            <option value="leader">Leader</option><option value="administrator">Administrator</option><option value="safeguarding_lead">Safeguarding lead</option><option value="volunteer_coordinator">Volunteer coordinator</option><option value="other">Other</option>
          </select>
        </Field>
      </div>
      <details className="mt-5 rounded-xl bg-[#f6f8f8] p-4">
        <summary className="cursor-pointer text-sm font-bold text-slate-700">Help us make the next resource more useful <span className="font-normal text-slate-500">(optional)</span></summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Team size" htmlFor="tracker-team-size"><select id="tracker-team-size" value={form.teamSize ?? ""} onChange={(event) => update("teamSize", (event.target.value || undefined) as FormState["teamSize"])} className="form-input"><option value="">Choose one</option><option value="1-10">1–10</option><option value="11-25">11–25</option><option value="26-50">26–50</option><option value="51+">51+</option></select></Field>
          <Field label="What do you use today?" htmlFor="tracker-current-tools"><select id="tracker-current-tools" value={form.currentTools ?? ""} onChange={(event) => update("currentTools", (event.target.value || undefined) as FormState["currentTools"])} className="form-input"><option value="">Choose one</option><option value="spreadsheet">Spreadsheet</option><option value="whatsapp">WhatsApp</option><option value="paper">Paper</option><option value="multiple_tools">Multiple tools</option><option value="system">System already in place</option></select></Field>
        </div>
      </details>
      <label className="mt-5 flex cursor-pointer gap-3 text-sm leading-relaxed text-slate-600">
        <input type="checkbox" checked={form.consentMarketing} onChange={(event) => update("consentMarketing", event.target.checked)} className="mt-1 h-4 w-4 rounded border-slate-300 text-[#149b7e] focus:ring-[#149b7e]" />
        <span>Yes, send me practical Nexsteps updates and follow-up tips. You can unsubscribe at any time.</span>
      </label>
      <p className="mt-3 text-xs leading-relaxed text-slate-500">By downloading, you agree to our <a className="underline underline-offset-2" href="/privacy">privacy notice</a>. Marketing updates are optional.</p>
      {status === "error" ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      <button type="submit" disabled={status === "submitting"} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#149b7e] px-5 py-3.5 font-bold text-white transition hover:bg-[#0e8069] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#149b7e] focus-visible:ring-offset-2">
        {status === "submitting" ? <><LoaderCircle className="h-5 w-5 animate-spin" /> Preparing your tracker…</> : <>Send me the free tracker <Download className="h-4 w-4" /></>}
      </button>
    </form>
  );
}

function Field({ children, htmlFor, label }: { children: React.ReactNode; htmlFor: string; label: string }) {
  return <label htmlFor={htmlFor} className="grid gap-1.5 text-sm font-bold text-slate-700">{label}{children}</label>;
}
