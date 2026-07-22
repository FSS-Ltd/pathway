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
  SCHOOL_PREVIEW_VERTICALS,
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
import { sceneSlots, type SceneSlot } from "./scene-layout";

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
  if (state.orgType === "SCHOOL" && !state.vertical) {
    return "School workspace preview showing Independent School, ACE School and State School.";
  }

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

type ForegroundLayer = {
  id: string;
  imagePath: string;
};

type SceneImageProps = {
  imagePath: string;
  slot: SceneSlot;
  prefersReducedMotion: boolean;
};

function SceneImage({
  imagePath,
  slot,
  prefersReducedMotion,
}: SceneImageProps) {
  return (
    <motion.div
      layout={!prefersReducedMotion}
      initial={
        prefersReducedMotion
          ? { opacity: 0 }
          : { opacity: 0, scale: 0.85, y: -12 }
      }
      animate={
        prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }
      }
      exit={
        prefersReducedMotion
          ? { opacity: 0, transition: reducedMotionFade }
          : { opacity: 0, scale: 0.9, transition: exitEase }
      }
      transition={prefersReducedMotion ? reducedMotionFade : springEnter}
      style={slot}
      className="absolute aspect-square"
    >
      <Image
        src={imagePath}
        alt=""
        fill
        sizes={CONFIGURATOR_OBJECT_SIZES}
        className="object-contain"
      />
    </motion.div>
  );
}

function SchoolPreview() {
  return (
    <div className="absolute inset-0 grid grid-cols-3">
      {SCHOOL_PREVIEW_VERTICALS.map((vertical) => (
        <Image
          key={vertical}
          src={verticalImagePath(vertical)}
          alt=""
          fill={false}
          width={512}
          height={512}
          sizes="(min-width: 1024px) 15vw, 30vw"
          className="h-full w-full object-cover"
        />
      ))}
    </div>
  );
}

export function ConfiguratorStage({ state }: ConfiguratorStageProps) {
  const prefersReducedMotion = useReducedMotion() ?? false;
  const previousStep = useRef(state.step);
  const stageControls = useAnimationControls();

  useConfiguratorImagePreloads();

  useEffect(() => {
    const isForwardStep =
      STEP_ORDER.indexOf(state.step) > STEP_ORDER.indexOf(previousStep.current);

    if (!prefersReducedMotion && isForwardStep) {
      void stageControls.start(settleZoom);
    } else if (!prefersReducedMotion) {
      stageControls.set({ scale: 1 });
    }
    previousStep.current = state.step;
  }, [prefersReducedMotion, stageControls, state.step]);

  const vertical = state.vertical;
  const foregroundLayers: ForegroundLayer[] = configuredModulesForState(
    state,
  ).map((module) => ({
    id: module,
    imagePath: MODULE_CATALOG[module].imagePath,
  }));
  const storagePath =
    state.storageChoice === "none"
      ? null
      : storageImagePath(state.storageChoice);
  if (storagePath) {
    foregroundLayers.push({ id: state.storageChoice, imagePath: storagePath });
  }
  const slots = sceneSlots(foregroundLayers.length);
  const caption = stageCaption(state);
  const swapTransition = prefersReducedMotion ? instantSwap : backdropFade;

  return (
    <section className="rounded-2xl bg-muted p-4 shadow-card lg:p-6">
      <motion.div
        animate={prefersReducedMotion ? { opacity: 1 } : stageControls}
        className="min-w-0"
      >
        <div
          role="img"
          aria-label={caption}
          className="relative aspect-[3/2] overflow-hidden rounded-xl bg-surface lg:rounded-2xl"
        >
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
                  alt=""
                  fill
                  priority
                  sizes={CONFIGURATOR_BACKDROP_SIZES}
                  className="object-cover"
                />
              </motion.div>
            ) : state.orgType === "SCHOOL" ? (
              <motion.div
                key="school-preview"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={swapTransition}
                className="absolute inset-0"
              >
                <SchoolPreview />
              </motion.div>
            ) : null}
          </AnimatePresence>
          {!vertical && state.orgType !== "SCHOOL" ? (
            <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-text-muted">
              Choose a setting to start building your workspace.
            </p>
          ) : null}
          <AnimatePresence initial={!prefersReducedMotion}>
            {foregroundLayers.map((layer, index) => (
              <SceneImage
                key={layer.id}
                imagePath={layer.imagePath}
                slot={slots[index]}
                prefersReducedMotion={prefersReducedMotion}
              />
            ))}
          </AnimatePresence>
        </div>
      </motion.div>
      <p aria-hidden="true" className="mt-4 text-xs text-text-muted lg:text-sm">
        {caption}
      </p>
    </section>
  );
}
