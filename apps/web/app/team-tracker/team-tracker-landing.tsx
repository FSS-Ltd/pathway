"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowDown,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  FileSpreadsheet,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import TeamTrackerForm from "./team-tracker-form";
import AnalyticsProvider from "../../components/analytics-provider";

const audiences = [
  { label: "Schools", detail: "Interventions, attendance and parent follow-ups" },
  { label: "Youth groups", detail: "Volunteers, youth nights and next steps" },
  { label: "Clubs", detail: "Members, sessions and the work around them" },
  { label: "Charities", detail: "Programme activity, contacts and actions" },
];

const inclusions = [
  "Four role-ready tabs: teacher, youth pastor, club organiser and charity admin.",
  "A weekly workspace for people, sessions, attendance and follow-ups.",
  "Simple dropdowns, automatic dashboard totals and overdue-action prompts.",
  "A working example row to make the first setup feel obvious.",
];

const steps = [
  ["01", "Download the workbook", "Your free tracker is ready the moment you submit the form."],
  ["02", "Choose your role tab", "Start with the space already shaped around your work."],
  ["03", "Run the week from one place", "Replace the example row and see the dashboard take shape."],
];

export default function TeamTrackerLanding() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#0c1726] text-white">
      <AnalyticsProvider />
      <header className="relative z-20 mx-auto flex max-w-7xl items-center justify-between px-5 py-6 sm:px-8 lg:px-10">
        <Link href="/" className="flex items-center gap-2.5 focus-visible:outline-none">
          <Image src="/NSLogo.svg" alt="Nexsteps" width={36} height={36} priority />
          <span className="text-lg font-bold tracking-tight">Nexsteps</span>
        </Link>
        <a
          href="#download"
          className="rounded-full border border-white/20 px-4 py-2 text-sm font-bold transition hover:border-[#52d0b2] hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#52d0b2]"
        >
          Get the free tracker
        </a>
      </header>

      <section className="relative">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(82,208,178,0.22),transparent_28%),radial-gradient(circle_at_82%_7%,rgba(246,198,102,0.16),transparent_25%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-14 px-5 pb-24 pt-10 sm:px-8 lg:grid-cols-[1.04fr_.96fr] lg:px-10 lg:pb-32 lg:pt-16">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="max-w-3xl"
          >
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#52d0b2]/30 bg-[#52d0b2]/10 px-3 py-1.5 text-sm font-bold text-[#a9f1df]">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Free practical tool for busy teams
            </div>
            <h1 className="max-w-2xl text-5xl font-bold leading-[0.98] tracking-[-0.055em] sm:text-6xl lg:text-7xl">
              A clearer week starts on one page.
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-relaxed text-slate-300 sm:text-xl">
              Keep your team, sessions and follow-ups in one clear place. The free Nexsteps One-Page Team Tracker gives schools, youth groups, clubs and charities a calmer way to run the work that matters.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm font-semibold text-slate-300">
              <span className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-[#52d0b2]" /> Free to use</span>
              <span className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4 text-[#52d0b2]" /> Set up in minutes</span>
              <span className="inline-flex items-center gap-2"><FileSpreadsheet className="h-4 w-4 text-[#52d0b2]" /> Excel workbook</span>
            </div>
            <a
              href="#download"
              className="mt-10 inline-flex items-center gap-2 rounded-full bg-[#52d0b2] px-6 py-3.5 font-bold text-[#0c1726] shadow-[0_14px_36px_rgba(82,208,178,0.28)] transition hover:-translate-y-0.5 hover:bg-[#75e4c9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#52d0b2] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c1726]"
            >
              Send me the free tracker <ArrowDown className="h-4 w-4" aria-hidden="true" />
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.14 }}
            className="relative lg:pt-2"
          >
            <div className="absolute -inset-5 rounded-[2rem] bg-[#52d0b2]/15 blur-3xl" />
            <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-white p-2 shadow-[0_30px_80px_rgba(0,0,0,0.34)]">
              <div className="flex items-center gap-1.5 border-b border-slate-200 px-3 py-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#ef9a9a]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#f6c666]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#52d0b2]" />
                <span className="ml-2 text-xs font-bold text-slate-500">Nexsteps team tracker</span>
              </div>
              <Image
                src="/team-tracker/weekly-view.png"
                alt="Nexsteps team tracker showing people, weekly schedule, attendance and follow-up sections"
                width={1400}
                height={1600}
                className="h-auto w-full"
                priority
              />
            </div>
            <div className="absolute -bottom-7 -left-5 rounded-2xl border border-white/15 bg-[#14243b] p-4 shadow-xl sm:-left-10">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#a9f1df]">Your week, visible</p>
              <p className="mt-1 text-sm font-semibold">People. Sessions. Actions.</p>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="bg-[#f8faf8] px-5 py-24 text-[#112035] sm:px-8 lg:px-10 lg:py-32">
        <div className="mx-auto max-w-7xl">
          <div className="grid items-end gap-8 lg:grid-cols-[.84fr_1.16fr]">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.15em] text-[#149b7e]">Built for the people doing the work</p>
              <h2 className="mt-4 max-w-md text-4xl font-bold leading-tight tracking-[-0.04em] sm:text-5xl">Less searching. More moving forward.</h2>
            </div>
            <p className="max-w-2xl text-lg leading-relaxed text-slate-600">This is not another system to learn. It is a ready-to-use rhythm for the small, important details that usually end up spread across notes, chats and separate spreadsheets.</p>
          </div>
          <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 sm:grid-cols-2 lg:grid-cols-4">
            {audiences.map((audience) => (
              <article key={audience.label} className="bg-white p-6 sm:p-7">
                <UsersRound className="h-5 w-5 text-[#16aa8a]" aria-hidden="true" />
                <h3 className="mt-9 text-xl font-bold">{audience.label}</h3>
                <p className="mt-3 leading-relaxed text-slate-600">{audience.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white px-5 py-24 text-[#112035] sm:px-8 lg:px-10 lg:py-32">
        <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[.92fr_1.08fr]">
          <div className="relative order-2 lg:order-1">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-[#f8faf8] p-2 shadow-[0_18px_60px_rgba(15,23,42,0.1)]">
              <Image
                src="/team-tracker/dashboard.png"
                alt="Nexsteps team tracker dashboard showing people, sessions, attendance and overdue follow-up totals"
                width={1400}
                height={560}
                className="h-auto w-full"
              />
            </div>
            <div className="absolute -bottom-5 right-5 rounded-xl bg-[#f6c666] px-4 py-3 text-sm font-bold shadow-lg">No maths required.</div>
          </div>
          <div className="order-1 lg:order-2">
            <p className="text-sm font-bold uppercase tracking-[0.15em] text-[#149b7e]">A useful result on day one</p>
            <h2 className="mt-4 text-4xl font-bold leading-tight tracking-[-0.04em] sm:text-5xl">A dashboard that tells you where the week stands.</h2>
            <ul className="mt-9 space-y-5">
              {inclusions.map((item) => (
                <li key={item} className="flex gap-3 text-base leading-relaxed text-slate-600">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#16aa8a]" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="bg-[#e8f5f1] px-5 py-24 text-[#112035] sm:px-8 lg:px-10 lg:py-32">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-xl">
            <p className="text-sm font-bold uppercase tracking-[0.15em] text-[#149b7e]">From blank page to a better week</p>
            <h2 className="mt-4 text-4xl font-bold tracking-[-0.04em] sm:text-5xl">Three simple steps. One calmer system.</h2>
          </div>
          <div className="mt-14 grid gap-6 lg:grid-cols-3">
            {steps.map(([number, title, description]) => (
              <article key={number} className="rounded-2xl bg-[#0c1726] p-7 text-white sm:p-8">
                <p className="text-sm font-bold tracking-[0.15em] text-[#a9f1df]">{number}</p>
                <h3 className="mt-12 text-2xl font-bold">{title}</h3>
                <p className="mt-4 leading-relaxed text-slate-300">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="download" className="scroll-mt-8 bg-[#0c1726] px-5 py-24 sm:px-8 lg:px-10 lg:py-32">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[.85fr_1.15fr] lg:items-start">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.15em] text-[#a9f1df]">Ready when you are</p>
            <h2 className="mt-4 max-w-xl text-4xl font-bold leading-tight tracking-[-0.04em] sm:text-5xl">Send the tracker to your inbox. Start the week differently.</h2>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-slate-300">We will send the workbook straight away. If you opt in, we will also share a short set of useful follow-ups that help you get more from it.</p>
            <div className="mt-10 flex gap-3 rounded-xl border border-[#f6c666]/30 bg-[#f6c666]/10 p-4 text-sm leading-relaxed text-[#fff0c8]">
              <ShieldCheck className="h-5 w-5 shrink-0" aria-hidden="true" />
              <p>For day-to-day coordination only. Do not store safeguarding concerns or sensitive personal information in this workbook; use your organisation&apos;s approved secure process.</p>
            </div>
          </div>
          <TeamTrackerForm />
        </div>
      </section>

      <footer className="border-t border-white/10 bg-[#0c1726] px-5 py-8 text-sm text-slate-400 sm:px-8 lg:px-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Nexsteps. Forward together.</p>
          <div className="flex gap-5">
            <Link href="/privacy" className="transition hover:text-white">Privacy notice</Link>
            <Link href="/demo" className="inline-flex items-center gap-1 transition hover:text-white">See Nexsteps <ArrowRight className="h-3.5 w-3.5" /></Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
