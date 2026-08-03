"use client";

import Image from "next/image";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import type { HomeschoolProductChapter } from "./homeschool-content";

const chapterColors: Record<HomeschoolProductChapter["accent"], string> = {
  mint: "bg-[#dff3ed]",
  yellow: "bg-[#f6ebc8]",
  sky: "bg-[#e5eef2]",
};

type ProductRevealProps = {
  chapter: HomeschoolProductChapter;
  index: number;
};

export default function ProductReveal({ chapter, index }: ProductRevealProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });
  const screenY = useTransform(scrollYProgress, [0, 0.3, 0.68, 1], [120, 28, 0, -56]);
  const screenScale = useTransform(scrollYProgress, [0, 0.3, 0.68, 1], [0.82, 0.94, 1, 0.96]);
  const screenRotate = useTransform(
    scrollYProgress,
    [0, 0.38, 0.72],
    [index % 2 === 0 ? -7 : 7, index % 2 === 0 ? -2 : 2, 0],
  );
  const screenOpacity = useTransform(scrollYProgress, [0, 0.16, 0.84, 1], [0.28, 1, 1, 0.58]);
  const copyY = useTransform(scrollYProgress, [0, 0.32, 0.7], [64, 12, 0]);
  const copyOpacity = useTransform(scrollYProgress, [0, 0.22, 0.7], [0.2, 0.72, 1]);
  const imageFirst = index % 2 === 1;

  return (
    <section
      ref={sectionRef}
      id={chapter.id}
      className={`${chapterColors[chapter.accent]} relative min-h-[115vh] overflow-hidden lg:min-h-[155vh]`}
    >
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-24 sm:px-8 lg:sticky lg:top-20 lg:min-h-[calc(100vh-5rem)] lg:grid-cols-[0.85fr_1.15fr] lg:px-12 lg:py-16">
        <motion.div
          style={prefersReducedMotion ? undefined : { y: copyY, opacity: copyOpacity }}
          className={`relative z-10 max-w-xl ${imageFirst ? "lg:order-2 lg:pl-10" : ""}`}
        >
          <div className="mb-9 flex items-center gap-5 text-xs font-bold uppercase tracking-[0.22em] text-[#305d55]">
            <span>{chapter.number}</span>
            <span className="h-px w-12 bg-[#305d55]" aria-hidden="true" />
            <span>{chapter.eyebrow}</span>
          </div>
          <h2 className="font-heading text-[clamp(2.6rem,5.5vw,5.6rem)] font-bold leading-[0.94] tracking-[-0.045em] text-[#283331]">
            {chapter.heading}
          </h2>
          <p className="mt-8 text-xl leading-8 text-[#344743] sm:text-2xl sm:leading-9">
            {chapter.answer}
          </p>
          <p className="mt-6 max-w-lg text-base leading-7 text-[#55706a] sm:text-lg">
            {chapter.detail}
          </p>
        </motion.div>

        <motion.figure
          style={
            prefersReducedMotion
              ? undefined
              : {
                  y: screenY,
                  scale: screenScale,
                  rotate: screenRotate,
                  opacity: screenOpacity,
                }
          }
          className={`relative mx-auto w-full max-w-[29rem] lg:max-w-[34rem] ${
            imageFirst ? "lg:order-1" : ""
          }`}
        >
          <div className="overflow-hidden rounded-[3.25rem] border border-white/80 bg-white shadow-[0_45px_110px_rgba(20,45,40,0.22)]">
            <Image
              src={chapter.imageSrc}
              alt={chapter.imageAlt}
              width={430}
              height={932}
              sizes="(max-width: 1024px) 88vw, 34rem"
              className="h-auto w-full"
            />
          </div>
          <figcaption className="sr-only">{chapter.imageAlt}</figcaption>
        </motion.figure>
      </div>
    </section>
  );
}
