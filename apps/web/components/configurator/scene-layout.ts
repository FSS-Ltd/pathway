import { PLANS } from "@pathway/pricing";
import { VERTICAL_LABELS } from "@pathway/types";
import {
  configuredModulesForState,
  includedModulesForState,
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
  bottom: `${number}%`;
  width: `${number}%`;
};

type SceneObjectCount = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

const SCENE_SLOTS: Readonly<
  Record<SceneObjectCount, readonly SceneSlot[]>
> = {
  1: [{ left: "41%", bottom: "1%", width: "18%" }],
  2: [
    { left: "20%", bottom: "1%", width: "18%" },
    { left: "62%", bottom: "1%", width: "18%" },
  ],
  3: [
    { left: "8%", bottom: "1%", width: "16%" },
    { left: "42%", bottom: "1%", width: "16%" },
    { left: "76%", bottom: "1%", width: "16%" },
  ],
  4: [
    { left: "4%", bottom: "1%", width: "15%" },
    { left: "29%", bottom: "1%", width: "15%" },
    { left: "54%", bottom: "1%", width: "15%" },
    { left: "79%", bottom: "1%", width: "15%" },
  ],
  5: [
    { left: "3%", bottom: "1%", width: "14%" },
    { left: "23%", bottom: "1%", width: "14%" },
    { left: "43%", bottom: "1%", width: "14%" },
    { left: "63%", bottom: "1%", width: "14%" },
    { left: "83%", bottom: "1%", width: "14%" },
  ],
  6: [
    { left: "2%", bottom: "1%", width: "13%" },
    { left: "18.5%", bottom: "1%", width: "13%" },
    { left: "35%", bottom: "1%", width: "13%" },
    { left: "51.5%", bottom: "1%", width: "13%" },
    { left: "68%", bottom: "1%", width: "13%" },
    { left: "84.5%", bottom: "1%", width: "13%" },
  ],
  7: [
    { left: "15%", bottom: "17%", width: "12%" },
    { left: "44%", bottom: "17%", width: "12%" },
    { left: "73%", bottom: "17%", width: "12%" },
    { left: "5%", bottom: "1%", width: "12%" },
    { left: "31%", bottom: "1%", width: "12%" },
    { left: "57%", bottom: "1%", width: "12%" },
    { left: "83%", bottom: "1%", width: "12%" },
  ],
  8: [
    { left: "5%", bottom: "17%", width: "12%" },
    { left: "31%", bottom: "17%", width: "12%" },
    { left: "57%", bottom: "17%", width: "12%" },
    { left: "83%", bottom: "17%", width: "12%" },
    { left: "17%", bottom: "1%", width: "12%" },
    { left: "39%", bottom: "1%", width: "12%" },
    { left: "61%", bottom: "1%", width: "12%" },
    { left: "83%", bottom: "1%", width: "12%" },
  ],
  9: [
    { left: "8%", bottom: "15%", width: "11%" },
    { left: "34%", bottom: "15%", width: "11%" },
    { left: "60%", bottom: "15%", width: "11%" },
    { left: "86%", bottom: "15%", width: "11%" },
    { left: "3%", bottom: "1%", width: "10%" },
    { left: "24%", bottom: "1%", width: "10%" },
    { left: "45%", bottom: "1%", width: "10%" },
    { left: "66%", bottom: "1%", width: "10%" },
    { left: "87%", bottom: "1%", width: "10%" },
  ],
  10: [
    { left: "3%", bottom: "15%", width: "10%" },
    { left: "24%", bottom: "15%", width: "10%" },
    { left: "45%", bottom: "15%", width: "10%" },
    { left: "66%", bottom: "15%", width: "10%" },
    { left: "87%", bottom: "15%", width: "10%" },
    { left: "13%", bottom: "1%", width: "10%" },
    { left: "31%", bottom: "1%", width: "10%" },
    { left: "49%", bottom: "1%", width: "10%" },
    { left: "67%", bottom: "1%", width: "10%" },
    { left: "85%", bottom: "1%", width: "10%" },
  ],
};

export function sceneSlots(count: number): readonly SceneSlot[] {
  if (!Number.isInteger(count) || count < 0 || count > 10) {
    throw new RangeError(
      "Scene object count must be an integer between 0 and 10.",
    );
  }

  if (count === 0) return [];
  return SCENE_SLOTS[count as SceneObjectCount].map((slot) => ({ ...slot }));
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
  accessibleDescription: string;
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

const STORAGE_LABELS: Record<
  Exclude<ConfiguratorState["storageChoice"], "none">,
  string
> = {
  "100": "100GB",
  "200": "200GB",
  "1000": "1TB",
};

function moduleList(modules: readonly (keyof typeof MODULE_CATALOG)[]): string {
  return modules.length > 0
    ? modules.map((module) => MODULE_CATALOG[module].label).join(", ")
    : "none";
}

function sceneAccessibleDescription(
  state: ConfiguratorState,
  caption: string,
): string {
  const sentence = caption.endsWith(".") ? caption.slice(0, -1) : caption;
  const storage =
    state.storageChoice === "none"
      ? "none"
      : STORAGE_LABELS[state.storageChoice];

  return `${sentence}. Included modules: ${moduleList(includedModulesForState(state))}. Optional modules: ${moduleList(state.selectedOptionalModules)}. Extra storage: ${storage}.`;
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
  const caption = sceneCaption(state);

  return {
    base: sceneBase(state),
    caption,
    accessibleDescription: sceneAccessibleDescription(state, caption),
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
