"use client";

import { useEffect, useRef } from "react";
import Image, { getImageProps } from "next/image";
import {
  AnimatePresence,
  motion,
  useAnimationControls,
  useReducedMotion,
} from "framer-motion";
import type { ConfiguratorState } from "../../app/configure/state";
import {
  CONFIGURATOR_IMAGE_PATHS,
  CONFIGURATOR_BACKDROP_SIZES,
  CONFIGURATOR_OBJECT_SIZES,
  configuratorImageSizes,
} from "../../lib/module-catalog";
import { backdropFade, instantSwap, settleZoom } from "../../lib/motion";
import {
  buildSceneModel,
  sceneImageMotion,
  type SceneForegroundLayer,
  type SceneImageMotion,
} from "./scene-layout";

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

type SceneImageProps = {
  layer: SceneForegroundLayer;
  motion: SceneImageMotion;
};

function SceneImage({ layer, motion: imageMotion }: SceneImageProps) {
  return (
    <motion.div
      layout={imageMotion.layout}
      initial={imageMotion.initial}
      animate={imageMotion.animate}
      exit={imageMotion.exit}
      transition={imageMotion.transition}
      style={layer.slot}
      className="absolute aspect-square"
    >
      <Image
        src={layer.imagePath}
        alt=""
        fill
        sizes={CONFIGURATOR_OBJECT_SIZES}
        className="object-contain"
      />
    </motion.div>
  );
}

function SchoolPreview({ imagePaths }: { imagePaths: readonly string[] }) {
  return (
    <div className="absolute inset-0 grid grid-cols-3">
      {imagePaths.map((imagePath) => (
        <Image
          key={imagePath}
          src={imagePath}
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

  const scene = buildSceneModel(state);
  const imageMotion = sceneImageMotion(prefersReducedMotion);
  const swapTransition = prefersReducedMotion ? instantSwap : backdropFade;

  return (
    <section className="rounded-2xl bg-muted p-4 shadow-card lg:p-6">
      <motion.div
        animate={prefersReducedMotion ? { opacity: 1 } : stageControls}
        className="min-w-0"
      >
        <div
          role="img"
          aria-label={scene.caption}
          className="relative aspect-[3/2] overflow-hidden rounded-xl bg-surface lg:rounded-2xl"
        >
          <AnimatePresence mode="sync" initial={false}>
            {scene.base.kind === "vertical" ? (
              <motion.div
                key={scene.base.imagePaths[0]}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={swapTransition}
                className="absolute inset-0"
              >
                <Image
                  src={scene.base.imagePaths[0]}
                  alt=""
                  fill
                  priority
                  sizes={CONFIGURATOR_BACKDROP_SIZES}
                  className="object-cover"
                />
              </motion.div>
            ) : scene.base.kind === "school-preview" ? (
              <motion.div
                key="school-preview"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={swapTransition}
                className="absolute inset-0"
              >
                <SchoolPreview imagePaths={scene.base.imagePaths} />
              </motion.div>
            ) : null}
          </AnimatePresence>
          {scene.base.kind === "empty" ? (
            <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-text-muted">
              Choose a setting to start building your workspace.
            </p>
          ) : null}
          <AnimatePresence initial={!prefersReducedMotion}>
            {scene.foreground.map((layer) => (
              <SceneImage key={layer.id} layer={layer} motion={imageMotion} />
            ))}
          </AnimatePresence>
        </div>
      </motion.div>
      <p aria-hidden="true" className="mt-4 text-xs text-text-muted lg:text-sm">
        {scene.caption}
      </p>
    </section>
  );
}
