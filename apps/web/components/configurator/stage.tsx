"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import {
  AnimatePresence,
  motion,
  useAnimationControls,
  useReducedMotion,
} from "framer-motion";
import type { ConfiguratorState } from "../../app/configure/state";
import {
  CONFIGURATOR_BACKDROP_SIZES,
  CONFIGURATOR_OBJECT_SIZES,
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

type SceneImageProps = {
  layer: SceneForegroundLayer;
  motion: SceneImageMotion;
};

const SCHOOL_PREVIEW_POSITIONS = ["-1%", "29.5%", "60%"] as const;

function SceneImage({ layer, motion: imageMotion }: SceneImageProps) {
  return (
    <motion.div
      layout={imageMotion.layout}
      initial={imageMotion.initial}
      animate={imageMotion.animate}
      exit={imageMotion.exit}
      transition={imageMotion.transition}
      style={layer.slot}
      className="pointer-events-none absolute z-10 aspect-square"
    >
      <Image
        src={layer.imagePath}
        alt=""
        fill
        sizes={CONFIGURATOR_OBJECT_SIZES}
        className="object-contain drop-shadow-[0_8px_10px_rgba(15,23,42,0.22)]"
      />
    </motion.div>
  );
}

function SchoolPreview({
  imagePaths,
}: {
  imagePaths: readonly [string, string, string];
}) {
  return (
    <div className="absolute inset-0">
      {imagePaths.map((imagePath, index) => (
        <div
          key={imagePath}
          style={{ left: SCHOOL_PREVIEW_POSITIONS[index] }}
          className="absolute top-[18%] aspect-[3/2] w-[41.5%]"
        >
          <Image
            src={imagePath}
            alt=""
            fill
            sizes="(min-width: 1024px) 19vw, 24vw"
            className="object-contain"
          />
        </div>
      ))}
    </div>
  );
}

export function ConfiguratorStage({ state }: ConfiguratorStageProps) {
  const prefersReducedMotion = useReducedMotion() ?? false;
  const previousStep = useRef(state.step);
  const stageControls = useAnimationControls();

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
          aria-label={scene.accessibleDescription}
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
