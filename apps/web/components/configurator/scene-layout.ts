import { PLANS } from "@pathway/pricing";
import { VERTICAL_LABELS } from "@pathway/types";
import {
  configuredModulesForState,
  type ConfiguratorState,
} from "../../app/configure/state";
import {
  MODULE_CATALOG,
  SCHOOL_PREVIEW_VERTICALS,
  storageImagePath,
  verticalImagePath,
} from "../../lib/module-catalog";
import { exitEase, reducedMotionFade, springEnter } from "../../lib/motion";

export type SceneSlot = {
  left: `${number}%`;
  top: `${number}%`;
  width: `${number}%`;
};

const LARGE_SLOTS: Readonly<Record<1 | 2 | 3, readonly SceneSlot[]>> = {
  1: [{ left: "27%", top: "16%", width: "46%" }],
  2: [
    { left: "8%", top: "19%", width: "38%" },
    { left: "54%", top: "19%", width: "38%" },
  ],
  3: [
    { left: "4%", top: "25%", width: "30%" },
    { left: "35%", top: "25%", width: "30%" },
    { left: "66%", top: "25%", width: "30%" },
  ],
};

const COMPACT_ROW_SLOTS: Readonly<Record<4 | 5 | 6, readonly SceneSlot[]>> = {
  4: [
    { left: "12%", top: "25%", width: "16%" },
    { left: "32%", top: "25%", width: "16%" },
    { left: "52%", top: "25%", width: "16%" },
    { left: "72%", top: "25%", width: "16%" },
  ],
  5: [
    { left: "5%", top: "25%", width: "16%" },
    { left: "24%", top: "25%", width: "16%" },
    { left: "43%", top: "25%", width: "16%" },
    { left: "62%", top: "25%", width: "16%" },
    { left: "81%", top: "25%", width: "16%" },
  ],
  6: [
    { left: "2%", top: "25%", width: "16%" },
    { left: "18%", top: "25%", width: "16%" },
    { left: "34%", top: "25%", width: "16%" },
    { left: "50%", top: "25%", width: "16%" },
    { left: "66%", top: "25%", width: "16%" },
    { left: "82%", top: "25%", width: "16%" },
  ],
};

const STAGGERED_SLOTS: Readonly<Record<7 | 8 | 9 | 10, readonly SceneSlot[]>> =
  {
    7: [
      { left: "7%", top: "12%", width: "20%" },
      { left: "29%", top: "12%", width: "20%" },
      { left: "51%", top: "12%", width: "20%" },
      { left: "73%", top: "12%", width: "20%" },
      { left: "19%", top: "56%", width: "20%" },
      { left: "41%", top: "56%", width: "20%" },
      { left: "63%", top: "56%", width: "20%" },
    ],
    8: [
      { left: "7%", top: "12%", width: "20%" },
      { left: "29%", top: "12%", width: "20%" },
      { left: "51%", top: "12%", width: "20%" },
      { left: "73%", top: "12%", width: "20%" },
      { left: "7%", top: "56%", width: "20%" },
      { left: "29%", top: "56%", width: "20%" },
      { left: "51%", top: "56%", width: "20%" },
      { left: "73%", top: "56%", width: "20%" },
    ],
    9: [
      { left: "2%", top: "12%", width: "16%" },
      { left: "22%", top: "12%", width: "16%" },
      { left: "42%", top: "12%", width: "16%" },
      { left: "62%", top: "12%", width: "16%" },
      { left: "82%", top: "12%", width: "16%" },
      { left: "12%", top: "56%", width: "16%" },
      { left: "32%", top: "56%", width: "16%" },
      { left: "52%", top: "56%", width: "16%" },
      { left: "72%", top: "56%", width: "16%" },
    ],
    10: [
      { left: "2%", top: "12%", width: "16%" },
      { left: "22%", top: "12%", width: "16%" },
      { left: "42%", top: "12%", width: "16%" },
      { left: "62%", top: "12%", width: "16%" },
      { left: "82%", top: "12%", width: "16%" },
      { left: "2%", top: "56%", width: "16%" },
      { left: "22%", top: "56%", width: "16%" },
      { left: "42%", top: "56%", width: "16%" },
      { left: "62%", top: "56%", width: "16%" },
      { left: "82%", top: "56%", width: "16%" },
    ],
  };

export function sceneSlots(count: number): readonly SceneSlot[] {
  if (!Number.isInteger(count) || count < 0 || count > 10) {
    throw new RangeError(
      "Scene object count must be an integer between 0 and 10.",
    );
  }

  if (count === 0) return [];

  const slots =
    count <= 3
      ? LARGE_SLOTS[count as 1 | 2 | 3]
      : count <= 6
        ? COMPACT_ROW_SLOTS[count as 4 | 5 | 6]
        : STAGGERED_SLOTS[count as 7 | 8 | 9 | 10];

  return slots.map((slot) => ({ ...slot }));
}

export type SceneBase =
  | { kind: "empty"; imagePaths: readonly [] }
  | { kind: "vertical"; imagePaths: readonly [string] }
  | { kind: "school-preview"; imagePaths: readonly [string, string, string] };

export type SceneForegroundLayer = {
  id: string;
  imagePath: string;
  slot: SceneSlot;
};

export type SceneModel = {
  base: SceneBase;
  caption: string;
  foreground: readonly SceneForegroundLayer[];
};

export type SceneImageMotion = {
  layout: boolean;
  initial: { opacity: number; scale?: number; y?: number };
  animate: { opacity: number; scale?: number; y?: number };
  exit: {
    opacity: number;
    scale?: number;
    transition: typeof reducedMotionFade | typeof exitEase;
  };
  transition: typeof reducedMotionFade | typeof springEnter;
};

function sceneCaption(state: ConfiguratorState): string {
  if (state.orgType === "SCHOOL" && !state.vertical) {
    return "School workspace preview showing Independent School, ACE School and State School.";
  }

  if (!state.vertical || !state.planCode) {
    return "Choose a setting and plan to complete your configuration.";
  }

  return `${VERTICAL_LABELS[state.vertical]} · ${PLANS[state.planCode].displayName} · billed ${state.frequency}`;
}

function sceneBase(state: ConfiguratorState): SceneBase {
  if (state.vertical) {
    return {
      kind: "vertical",
      imagePaths: [verticalImagePath(state.vertical)],
    };
  }

  if (state.orgType === "SCHOOL") {
    return {
      kind: "school-preview",
      imagePaths: [
        verticalImagePath(SCHOOL_PREVIEW_VERTICALS[0]),
        verticalImagePath(SCHOOL_PREVIEW_VERTICALS[1]),
        verticalImagePath(SCHOOL_PREVIEW_VERTICALS[2]),
      ],
    };
  }

  return { kind: "empty", imagePaths: [] };
}

export function buildSceneModel(state: ConfiguratorState): SceneModel {
  const layers: Array<Pick<SceneForegroundLayer, "id" | "imagePath">> =
    configuredModulesForState(state).map((module) => ({
      id: module,
      imagePath: MODULE_CATALOG[module].imagePath,
    }));
  if (state.storageChoice !== "none") {
    layers.push({
      id: state.storageChoice,
      imagePath: storageImagePath(state.storageChoice),
    });
  }
  const slots = sceneSlots(layers.length);

  return {
    base: sceneBase(state),
    caption: sceneCaption(state),
    foreground: layers.map((layer, index) => ({
      ...layer,
      slot: slots[index],
    })),
  };
}

export function sceneImageMotion(
  prefersReducedMotion: boolean,
): SceneImageMotion {
  return prefersReducedMotion
    ? {
        layout: false,
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0, transition: reducedMotionFade },
        transition: reducedMotionFade,
      }
    : {
        layout: true,
        initial: { opacity: 0, scale: 0.85, y: -12 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.9, transition: exitEase },
        transition: springEnter,
      };
}
