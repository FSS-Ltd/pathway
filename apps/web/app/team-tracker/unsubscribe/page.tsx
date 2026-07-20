"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { unsubscribeTeamTracker } from "../../../lib/leads-client";

export default function TeamTrackerUnsubscribePage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#0c1726]" />}>
      <TeamTrackerUnsubscribeContent />
    </Suspense>
  );
}

function TeamTrackerUnsubscribeContent() {
  const token = useSearchParams().get("token");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");

  const unsubscribe = async () => {
    if (!token) {
      setStatus("error");
      return;
    }
    setStatus("submitting");
    try {
      await unsubscribeTeamTracker(token);
      setStatus("success");
    } catch {
      setStatus("error");
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-[#0c1726] px-5 py-12 text-white">
      <section className="w-full max-w-lg rounded-2xl bg-white p-8 text-[#112035] shadow-2xl sm:p-10">
        {status === "success" ? <CheckCircle2 className="h-10 w-10 text-[#149b7e]" /> : null}
        <p className="text-sm font-bold uppercase tracking-[0.15em] text-[#149b7e]">Nexsteps updates</p>
        <h1 className="mt-4 text-3xl font-bold tracking-[-0.04em]">{status === "success" ? "You have been unsubscribed." : "Stop team tracker follow-ups?"}</h1>
        <p className="mt-4 leading-relaxed text-slate-600">{status === "success" ? "We will not send further practical updates from this team-tracker sequence." : "This only stops the optional practical updates. Your original tracker download remains yours to keep."}</p>
        {status === "success" ? (
          <Link href="/" className="mt-8 inline-flex rounded-xl bg-[#149b7e] px-5 py-3 font-bold text-white">Return to Nexsteps</Link>
        ) : (
          <>
            {status === "error" ? <p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">That link is invalid or has already expired.</p> : null}
            <button onClick={unsubscribe} disabled={status === "submitting" || !token} className="mt-8 inline-flex items-center gap-2 rounded-xl bg-[#112035] px-5 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">
              {status === "submitting" ? <><LoaderCircle className="h-4 w-4 animate-spin" /> Updating…</> : "Unsubscribe me"}
            </button>
          </>
        )}
      </section>
    </main>
  );
}
