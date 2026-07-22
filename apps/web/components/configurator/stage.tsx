"use client";

import { useEffect, useRef } from "react";
import Image, { getImageProps } from "next/image";
import { PLANS } from "@pathway/pricing";
import { VERTICAL_LABELS } from "@pathway/types";
import {
  AnimatePresence,
  motion,
  useAnimationControls,
  useReducedMotion,
} from "framer-motion";
import {
  configuredModulesForState,
  type ConfiguratorState,
} from "../../app/configure/state";
import {
  CONFIGURATOR_IMAGE_PATHS,
  CONFIGURATOR_BACKDROP_SIZES,
  CONFIGURATOR_OBJECT_SIZES,
  MODULE_CATALOG,
  configuratorImageSizes,
  storageImagePath,
  verticalImagePath,
} from "../../lib/module-catalog";
import {
  backdropFade,
  exitEase,
  instantSwap,
  reducedMotionFade,
  settleZoom,
  springEnter,
} from "../../lib/motion";

type ConfiguratorStageProps = {
  state: ConfiguratorState;
};

const STEP_ORDER: ConfiguratorState["step"][] = [
  "plan",
  "org-type",
  "vertical",
  "included",
  "modules",
  "storage",
  "summary",
];

function stageCaption(state: ConfiguratorState): string {
  if (!state.vertical || !state.planCode) {
    return "Choose a setting and plan to complete your configuration.";
  }

  return `${VERTICAL_LABELS[state.vertical]} · ${PLANS[state.planCode].displayName} · billed ${state.frequency}`;
}

function useConfiguratorImagePreloads(): void {
  useEffect(() => {
    const links = CONFIGURATOR_IMAGE_PATHS.map((imagePath) => {
      const isBackdrop = imagePath.startsWith("/configurator/verticals/");
      const { props } = getImageProps({
        src: imagePath,
        alt: "",
        width: isBackdrop ? 1536 : 1024,
        height: 1024,
        sizes: configuratorImageSizes(imagePath),
      });
      const imageHref = new URL(props.src, window.location.href).href;
      const existing = Array.from(
        document.head.querySelectorAll<HTMLLinkElement>(
          'link[rel="preload"][as="image"]',
        ),
      ).find(
        (link) =>
          link.dataset.configuratorImage === imagePath ||
          link.href === imageHref,
      );
      if (existing) return null;

      const link = document.createElement("link");
      link.rel = "preload";
      link.as = "image";
      link.href = props.src;
      link.imageSrcset = props.srcSet ?? "";
      link.imageSizes = props.sizes ?? configuratorImageSizes(imagePath);
      link.dataset.configuratorImage = imagePath;
      document.head.append(link);
      return link;
    });

    return () => {
      links.forEach((link) => link?.remove());
    };
  }, []);
}

export function ConfiguratorStage({ state }: ConfiguratorStageProps) {
  const prefersReducedMotion = useReducedMotion();
  const previousStep = useRef(state.step);
  const stageControls = useAnimationControls();

  useConfiguratorImagePreloads();

  useEffect(() => {
    const isForwardStep =
      STEP_ORDER.indexOf(state.step) > STEP_ORDER.indexOf(previousStep.current);

    if (!prefersReducedMotion && isForwardStep) {
      void stageControls.start(settleZoom);
    } else {
      stageControls.set({ scale: 1 });
    }
    previousStep.current = state.step;
  }, [prefersReducedMotion, stageControls, state.step]);

  const vertical = state.vertical;
  const selectedModules = configuredModulesForState(state).map((module) => ({
    module,
    entry: MODULE_CATALOG[module],
  }));
  const storagePath =
    state.storageChoice === "none"
      ? null
      : storageImagePath(state.storageChoice);
  const caption = stageCaption(state);
  const isEmpty = !vertical && selectedModules.length === 0 && !storagePath;
  const swapTransition = prefersReducedMotion ? instantSwap : backdropFade;
  const entryTransition = prefersReducedMotion
    ? reducedMotionFade
    : springEnter;

  return (
    <section
      aria-label="Configuration stage"
      className="flex gap-4 rounded-2xl bg-muted p-4 shadow-card lg:block lg:p-6"
    >
      <motion.div animate={stageControls} className="min-w-0 flex-1 lg:w-full">
        <div className="relative aspect-[3/2] overflow-hidden rounded-xl bg-surface lg:rounded-2xl">
          <AnimatePresence mode="sync" initial={false}>
            {vertical ? (
              <motion.div
                key={vertical}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={swapTransition}
                className="absolute inset-0"
              >
                <Image
                  src={verticalImagePath(vertical)}
                  alt={`${VERTICAL_LABELS[vertical]} workspace illustration`}
                  fill
                  priority
                  sizes={CONFIGURATOR_BACKDROP_SIZES}
                  className="object-cover"
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
          {!vertical ? (
            <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-text-muted">
              Choose a setting to start building your workspace.
            </p>
          ) : null}
        </div>
      </motion.div>

      <div className="flex min-w-0 flex-1 flex-col justify-between gap-3 lg:mt-5 lg:block">
        {isEmpty ? (
          <p className="text-sm text-text-muted lg:hidden">
            Add modules or storage to build your configuration.
          </p>
        ) : null}
        <div className="flex min-h-16 flex-wrap items-center gap-2 lg:grid lg:min-h-24 lg:grid-cols-3">
          <AnimatePresence initial={!prefersReducedMotion}>
            {selectedModules.map(({ module, entry }) => (
              <motion.div
                layout={!prefersReducedMotion}
                key={module}
                initial={
                  prefersReducedMotion
                    ? { opacity: 0 }
                    : { opacity: 0, scale: 0.85, y: -12 }
                }
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={
                  prefersReducedMotion
                    ? { opacity: 0, transition: reducedMotionFade }
                    : { opacity: 0, scale: 0.9, transition: exitEase }
                }
                transition={entryTransition}
                className="relative h-12 w-12 overflow-hidden rounded-lg bg-surface lg:h-24 lg:w-full"
              >
                <Image
                  src={entry.imagePath}
                  alt={entry.imageAlt}
                  fill
                  sizes={CONFIGURATOR_OBJECT_SIZES}
                  className="object-contain p-1"
                />
              </motion.div>
            ))}
          </AnimatePresence>
          <div className="relative h-12 w-12 overflow-hidden rounded-lg bg-surface lg:h-24 lg:w-full">
            <AnimatePresence mode="sync" initial={!prefersReducedMotion}>
              {storagePath ? (
                <motion.div
                  key={storagePath}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{
                    opacity: 0,
                    transition: prefersReducedMotion
                      ? reducedMotionFade
                      : exitEase,
                  }}
                  transition={entryTransition}
                  className="absolute inset-0"
                >
                  <Image
                    src={storagePath}
                    alt={`${state.storageChoice === "1000" ? "1TB" : `${state.storageChoice}GB`} extra storage illustration`}
                    fill
                    sizes={CONFIGURATOR_OBJECT_SIZES}
                    className="object-contain p-1"
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
        <AnimatePresence mode="sync" initial={false}>
          <motion.p
            key={caption}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={swapTransition}
            className="text-xs text-text-muted lg:mt-4 lg:text-sm"
          >
            {caption}
          </motion.p>
        </AnimatePresence>
      </div>
    </section>
  );
}
