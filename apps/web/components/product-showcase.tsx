"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import ScrollReveal from "./scroll-reveal";

const ADMIN_SRC = "/product/admin-dashboard.png";
const MOBILE_SESSION_SRC = "/product/mobile-session.png";
const MOBILE_WELCOME_SRC = "/product/mobile-welcome.png";

function BrowserFrame({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-[0_40px_120px_-20px_rgba(2,6,23,0.5)]">
      <div className="flex items-center gap-1.5 border-b border-white/10 bg-slate-900/80 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
        <div className="ml-3 flex-1 rounded-full bg-white/5 px-4 py-1 text-center text-xs text-slate-400">
          app.nexsteps.dev
        </div>
      </div>
      <div className="relative aspect-[16/9] w-full">
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(min-width: 768px) 768px, 100vw"
          className="object-cover object-top"
          priority
        />
      </div>
    </div>
  );
}

function PhoneFrame({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    <div
      className={`w-[220px] overflow-hidden rounded-[2.25rem] border-[6px] border-slate-900 bg-slate-900 shadow-[0_30px_80px_-20px_rgba(2,6,23,0.55)] md:w-[240px] ${className ?? ""}`}
    >
      <div className="relative aspect-[9/18] w-full">
        <div className="absolute left-1/2 top-0 z-10 h-5 w-24 -translate-x-1/2 rounded-b-2xl bg-slate-900" />
        <Image src={src} alt={alt} fill sizes="240px" className="object-cover" />
      </div>
    </div>
  );
}

export default function ProductShowcase() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section className="relative overflow-hidden bg-white py-20 md:py-28">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[560px] w-[560px] -translate-x-1/2 rounded-full bg-accent-primary/10 blur-3xl"
      />
      <div className="relative mx-auto max-w-6xl px-4">
        <ScrollReveal className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-strong">
            One system, every screen
          </span>
          <h2 className="mt-4 text-3xl font-bold text-text-primary md:text-5xl">
            The same real-time picture, wherever your team is.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-text-muted">
            Leaders get a full control room on the web. Staff and volunteers get a fast,
            focused app for sessions on the move. Same data, no re-entry, no gaps.
          </p>
        </ScrollReveal>

        <div className="relative mt-16 md:mt-24">
          <ScrollReveal delay={0.1} className="mx-auto max-w-4xl">
            <BrowserFrame src={ADMIN_SRC} alt="NexSteps admin dashboard overview" />
          </ScrollReveal>

          <div className="pointer-events-none absolute inset-x-0 -bottom-24 flex justify-center gap-6 px-4 md:-bottom-32 md:gap-10">
            <motion.div
              className="pointer-events-auto hidden md:block"
              initial={{ opacity: 0, y: 40, rotate: -6 }}
              whileInView={{ opacity: 1, y: 0, rotate: -6 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.7, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
            >
              <motion.div
                animate={prefersReducedMotion ? undefined : { y: [0, -8, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
              >
                <PhoneFrame src={MOBILE_WELCOME_SRC} alt="NexSteps mobile app space picker" />
              </motion.div>
            </motion.div>

            <motion.div
              className="pointer-events-auto -translate-y-6 md:translate-y-6"
              initial={{ opacity: 0, y: 40, rotate: 6 }}
              whileInView={{ opacity: 1, y: 0, rotate: 6 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.7, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              <motion.div
                animate={prefersReducedMotion ? undefined : { y: [0, -12, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              >
                <PhoneFrame src={MOBILE_SESSION_SRC} alt="NexSteps mobile app today screen" />
              </motion.div>
            </motion.div>
          </div>
        </div>

        {/* Reserve room for the phones that overhang the browser frame below. */}
        <div className="h-24 md:h-40" aria-hidden />
      </div>
    </section>
  );
}
