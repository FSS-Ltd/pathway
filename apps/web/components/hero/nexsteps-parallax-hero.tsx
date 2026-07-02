"use client";

import Image from "next/image";
import Link from "next/link";
import {
  MotionValue,
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import { useEffect, useRef, useState } from "react";
import CtaButton from "../cta-button";

// 4K for desktop; 1080p for small screens where 4K decode and download
// cost make the scrub stutter or never start (the old "static image" bug).
const VIDEO_SOURCES = {
  desktop: {
    webm: "/hero/nexsteps-hero-scroll.webm",
    mp4: "/hero/nexsteps-hero-scroll.mp4",
  },
  mobile: {
    webm: "/hero/nexsteps-hero-scroll-1080.webm",
    mp4: "/hero/nexsteps-hero-scroll-1080.mp4",
  },
};
const POSTER = "/hero/nexsteps-hero-poster.webp";

// Portion of scroll progress that scrubs the video; the rest holds the final
// calm frame while the logo/tagline take over.
const VIDEO_SCRUB_END = 0.88;

interface CopyStage {
  from: number;
  to: number;
  headline: string;
  micro?: string;
}

const COPY_STAGES: CopyStage[] = [
  {
    from: 0,
    to: 0.15,
    headline: "Your day should not run in five different places.",
    micro: "Registers. Rotas. Group chats. Safeguarding notes. Reports.",
  },
  {
    from: 0.15,
    to: 0.35,
    headline: "When systems are disconnected, support gets harder to deliver.",
    micro: "Missed actions. Manual reports. Weak audit trails. Too much admin friction.",
  },
  {
    from: 0.35,
    to: 0.55,
    headline: "NexSteps brings the workflow together.",
    micro: "Attendance, rotas, safeguarding, communications and reporting in one place.",
  },
  {
    from: 0.55,
    to: 0.75,
    headline: "One auditable system of record.",
    micro: "Clear roles. Better visibility. Fewer missed follow-ups.",
  },
  {
    from: 0.75,
    to: 0.86,
    headline: "Less time chasing systems. More time supporting children.",
  },
];

function StageCopy({
  progress,
  stage,
  isFirst,
}: {
  progress: MotionValue<number>;
  stage: CopyStage;
  isFirst: boolean;
}) {
  const fadeIn = isFirst ? stage.from : stage.from + 0.03;
  const fadeOut = stage.to - 0.02;
  const opacity = useTransform(
    progress,
    isFirst
      ? [stage.from, fadeOut, stage.to]
      : [stage.from, fadeIn, fadeOut, stage.to],
    isFirst ? [1, 1, 0] : [0, 1, 1, 0],
  );
  const y = useTransform(progress, [stage.from, stage.to], [24, -24]);

  return (
    <motion.div
      style={{ opacity, y }}
      className="absolute inset-x-0 bottom-[18vh] mx-auto max-w-3xl px-6 text-center md:bottom-[16vh]"
    >
      <h2 className="text-3xl font-bold leading-tight text-white drop-shadow-[0_2px_12px_rgba(2,6,23,0.8)] md:text-5xl">
        {stage.headline}
      </h2>
      {stage.micro ? (
        <p className="mt-4 text-sm font-medium tracking-wide text-slate-200/90 drop-shadow-[0_1px_8px_rgba(2,6,23,0.8)] md:text-base">
          {stage.micro}
        </p>
      ) : null}
    </motion.div>
  );
}

// The video itself ends on the NexSteps logo, so the reveal only adds the
// tagline and CTAs beneath it — no DOM logo that would double the mark.
function FinalReveal({ progress }: { progress: MotionValue<number> }) {
  const opacity = useTransform(progress, [0.86, 0.93], [0, 1]);
  const y = useTransform(progress, [0.86, 0.98], [16, 0]);
  const ctaOpacity = useTransform(progress, [0.93, 0.99], [0, 1]);

  return (
    <motion.div
      style={{ opacity }}
      className="absolute inset-x-0 bottom-[8vh] flex flex-col items-center px-6 text-center"
    >
      <motion.p
        style={{ y }}
        className="text-4xl font-bold tracking-tight text-white drop-shadow-[0_2px_16px_rgba(2,6,23,0.7)] md:text-6xl"
      >
        Forward together
      </motion.p>
      <motion.div
        style={{ opacity: ctaOpacity }}
        className="mt-8 flex flex-wrap items-center justify-center gap-4"
      >
        <CtaButton href="/demo" location="home_hero" variant="primary">
          Book a demo
        </CtaButton>
        <Link
          href="/features/attendance"
          className="rounded-md border border-white/25 bg-white/10 px-6 py-3 text-base font-medium text-white backdrop-blur transition hover:bg-white/20"
        >
          See how it works
        </Link>
      </motion.div>
    </motion.div>
  );
}

/** Static hero for reduced motion, no-JS-scrub environments and small fallbacks. */
function StaticHero() {
  return (
    <section className="relative -mt-20 flex min-h-[100svh] flex-col items-center justify-center overflow-hidden bg-slate-950 px-6 pt-20 text-center">
      <div
        aria-hidden
        className="absolute inset-0 bg-cover bg-center opacity-60"
        style={{ backgroundImage: `url(${POSTER})` }}
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-b from-slate-950/70 via-slate-950/40 to-slate-950/80"
      />
      <div className="relative flex flex-col items-center">
        <div className="relative">
          <div
            aria-hidden
            className="absolute inset-0 -z-10 scale-150 rounded-full bg-accent-primary/30 blur-3xl"
          />
          <Image
            src="/NSLogo.svg"
            alt="NexSteps"
            width={112}
            height={112}
            className="h-24 w-24 md:h-28 md:w-28"
          />
        </div>
        <h1 className="mt-8 max-w-3xl text-3xl font-bold leading-tight text-white md:text-5xl">
          From admin chaos to coordinated care.
        </h1>
        <p className="mt-4 max-w-2xl text-base text-slate-200/90 md:text-lg">
          Attendance, rotas, safeguarding, communications and reporting — one
          trusted system for schools, clubs, churches and charities.
        </p>
        <p className="mt-8 text-2xl font-bold tracking-tight text-white md:text-3xl">
          Forward together
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <CtaButton href="/demo" location="home_hero" variant="primary">
            Book a demo
          </CtaButton>
          <Link
            href="/features/attendance"
            className="rounded-md border border-white/25 bg-white/10 px-6 py-3 text-base font-medium text-white backdrop-blur transition hover:bg-white/20"
          >
            See how it works
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function NexStepsParallaxHero() {
  const prefersReducedMotion = useReducedMotion();
  const outerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoFailed, setVideoFailed] = useState(false);
  // Resolved on mount so the client picks the right rendition; the poster
  // covers the first paint either way.
  const [sources, setSources] = useState<
    (typeof VIDEO_SOURCES)[keyof typeof VIDEO_SOURCES] | null
  >(null);

  useEffect(() => {
    setSources(
      window.matchMedia("(max-width: 767px)").matches
        ? VIDEO_SOURCES.mobile
        : VIDEO_SOURCES.desktop,
    );
  }, []);

  const { scrollYProgress } = useScroll({
    target: outerRef,
    offset: ["start start", "end end"],
  });

  // Scrub target updated from scroll; an rAF loop lerps currentTime toward it
  // because seeking directly on every scroll event stutters.
  const scrubTarget = useRef(0);
  useMotionValueEvent(scrollYProgress, "change", (p) => {
    scrubTarget.current = Math.min(p / VIDEO_SCRUB_END, 1);
  });

  useEffect(() => {
    if (prefersReducedMotion) return;
    let frame: number;
    const tick = () => {
      const video = videoRef.current;
      // Skip while a seek is in flight — stacking seeks on a high-res
      // stream makes the decoder thrash and the scrub stutter.
      if (video && video.readyState >= 2 && video.duration && !video.seeking) {
        // Leave a small tail so we never seek past the last frame.
        const target = scrubTarget.current * (video.duration - 0.05);
        const delta = target - video.currentTime;
        if (Math.abs(delta) > 0.25) {
          video.currentTime += delta * 0.2;
        } else if (Math.abs(delta) > 1 / 60) {
          // Close to target: snap instead of chasing sub-frame deltas,
          // so each scroll step costs exactly one seek.
          video.currentTime = target;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [prefersReducedMotion]);

  const scrollHintOpacity = useTransform(scrollYProgress, [0, 0.05], [1, 0]);
  // Ease the dark scrims off as the video brightens into its dawn ending.
  const scrimOpacity = useTransform(scrollYProgress, [0, 0.75, 0.92], [1, 1, 0.35]);

  if (prefersReducedMotion) {
    return <StaticHero />;
  }

  return (
    <div ref={outerRef} className="relative -mt-20 h-[550vh] bg-slate-950">
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        {/* Base gradient so the scene reads correctly before video frames arrive */}
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(23,184,158,0.12),_rgba(2,6,23,1)_70%)]"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${POSTER})` }}
        />
        {!videoFailed && sources ? (
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full object-cover"
            muted
            playsInline
            preload="auto"
            poster={POSTER}
            aria-hidden
            onLoadedMetadata={(e) => {
              // iOS refuses to buffer video until playback starts, leaving
              // the hero stuck on the poster; a muted play/pause kicks the
              // pipeline into loading so scrubbing works.
              const video = e.currentTarget;
              video
                .play()
                .then(() => video.pause())
                .catch(() => {});
            }}
            onError={(e) => {
              // React surfaces <source> fallback errors here too; only bail
              // when the media element itself has given up.
              if (e.currentTarget.error) setVideoFailed(true);
            }}
          >
            <source src={sources.webm} type="video/webm" />
            <source src={sources.mp4} type="video/mp4" />
          </video>
        ) : null}

        {/* Scrims for text contrast over the video */}
        <motion.div
          style={{ opacity: scrimOpacity }}
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-slate-950/80 via-slate-950/30 to-transparent"
        />
        <motion.div
          style={{ opacity: scrimOpacity }}
          aria-hidden
          className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-slate-950/60 to-transparent"
        />

        {COPY_STAGES.map((stage, i) => (
          <StageCopy
            key={stage.from}
            progress={scrollYProgress}
            stage={stage}
            isFirst={i === 0}
          />
        ))}

        <FinalReveal progress={scrollYProgress} />

        <motion.div
          style={{ opacity: scrollHintOpacity }}
          aria-hidden
          className="absolute inset-x-0 bottom-6 flex flex-col items-center gap-2 text-slate-300/80"
        >
          <span className="text-xs font-medium uppercase tracking-[0.2em]">
            Scroll
          </span>
          <motion.span
            animate={{ y: [0, 6, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            className="block h-6 w-px bg-slate-300/60"
          />
        </motion.div>

        {/* Screen-reader narrative equivalent of the visual sequence */}
        <h1 className="sr-only">
          NexSteps — from admin chaos to coordinated care. Attendance, rotas,
          safeguarding, communications and reporting in one trusted system.
          Forward together.
        </h1>
      </div>
    </div>
  );
}
