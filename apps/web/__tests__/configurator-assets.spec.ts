import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { VERTICAL_OPTIONS } from "@pathway/types";
import {
  CONFIGURATOR_BACKDROP_SIZES,
  CONFIGURATOR_IMAGE_PATHS,
  CONFIGURATOR_OBJECT_SIZES,
  MODULE_CATALOG,
  configuratorImageSizes,
  storageImagePath,
  verticalImagePath,
} from "../lib/module-catalog";
import { sceneSlots } from "../components/configurator/scene-layout";
import {
  backdropFade,
  configuratorStepVariants,
  exitEase,
  settleZoom,
  springEnter,
  staggerChildren,
  totalTick,
} from "../lib/motion";

const publicDirectory = join(process.cwd(), "public");
const pngSignature = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

describe("configurator imagery and motion contract", () => {
  it("maps every catalogue choice to a present image asset", () => {
    const derivedPaths = [
      ...Object.values(MODULE_CATALOG).map(({ imagePath }) => imagePath),
      ...(["100", "200", "1000"] as const).map(storageImagePath),
      ...VERTICAL_OPTIONS.map(({ value }) => verticalImagePath(value)),
    ];

    for (const path of derivedPaths) {
      expect(CONFIGURATOR_IMAGE_PATHS).toContain(path);
      expect(existsSync(join(publicDirectory, path))).toBe(true);
    }
  });

  it("uses nineteen unique, non-empty PNG assets", () => {
    expect(CONFIGURATOR_IMAGE_PATHS).toHaveLength(19);
    expect(new Set(CONFIGURATOR_IMAGE_PATHS).size).toBe(19);

    for (const path of CONFIGURATOR_IMAGE_PATHS) {
      expect(path).toMatch(/\.png$/);
      const image = readFileSync(join(publicDirectory, path));
      expect(image.length).toBeGreaterThan(0);
      expect(image.subarray(0, pngSignature.length)).toEqual(pngSignature);
    }
  });

  it("derives the planned vertical and storage filenames", () => {
    expect(
      VERTICAL_OPTIONS.map(({ value }) => verticalImagePath(value)),
    ).toEqual([
      "/configurator/verticals/church.png",
      "/configurator/verticals/independent-school.png",
      "/configurator/verticals/ace-school.png",
      "/configurator/verticals/state-school.png",
      "/configurator/verticals/nursery.png",
      "/configurator/verticals/charity.png",
      "/configurator/verticals/club.png",
    ]);
    expect(["100", "200", "1000"].map(storageImagePath)).toEqual([
      "/configurator/storage/storage-100gb.png",
      "/configurator/storage/storage-200gb.png",
      "/configurator/storage/storage-1tb.png",
    ]);
  });

  it("exports the planned motion vocabulary", () => {
    expect(springEnter).toEqual({
      type: "spring",
      stiffness: 260,
      damping: 22,
    });
    expect(exitEase).toEqual({ duration: 0.2, ease: "easeOut" });
    expect(backdropFade).toEqual({ duration: 0.4, ease: [0.4, 0, 0.2, 1] });
    expect(staggerChildren).toBe(0.05);
    expect(settleZoom).toEqual({
      scale: [1, 1.02, 1],
      transition: { duration: 0.45 },
    });
    expect(totalTick).toEqual({ duration: 0.4, ease: "easeOut" });
  });

  it("keeps stage motion and accessibility dependencies centralized", () => {
    const stage = readFileSync(
      join(process.cwd(), "components/configurator/stage.tsx"),
      "utf8",
    );
    const page = readFileSync(
      join(process.cwd(), "app/configure/page.tsx"),
      "utf8",
    );
    const total = readFileSync(
      join(process.cwd(), "components/configurator/running-total.tsx"),
      "utf8",
    );
    const card = readFileSync(
      join(process.cwd(), "components/configurator/selection-card.tsx"),
      "utf8",
    );

    expect(stage).toContain("lib/motion");
    expect(stage).toContain("useReducedMotion");
    expect(stage).toContain("AnimatePresence");
    expect(stage).toContain("next/image");
    expect(stage).toContain("priority");
    expect(stage).toContain("sizes");
    expect(stage).toContain("CONFIGURATOR_IMAGE_PATHS");
    expect(stage).not.toContain("duration:");
    expect(page).toContain("ConfiguratorStage");
    expect(page).toContain("AnimatePresence");
    expect(total).toContain("totalTick");
    expect(card).toContain("aria-pressed");
    expect(card).toContain("focus-visible:ring-2");
  });

  it("removes option-card stagger when reduced motion is requested", () => {
    const motionSource = readFileSync(
      join(process.cwd(), "lib/motion.ts"),
      "utf8",
    );
    const card = readFileSync(
      join(process.cwd(), "components/configurator/selection-card.tsx"),
      "utf8",
    );

    expect(motionSource).toContain("reducedOptionGroupVariants");
    expect(card).toContain("reducedOptionGroupVariants");
    expect(card).toMatch(
      /prefersReducedMotion\s*\?\s*reducedOptionGroupVariants\s*:\s*optionGroupVariants/,
    );
  });

  it("restarts forward stage settles and centralizes the latest step direction", () => {
    const stage = readFileSync(
      join(process.cwd(), "components/configurator/stage.tsx"),
      "utf8",
    );
    const page = readFileSync(
      join(process.cwd(), "app/configure/page.tsx"),
      "utf8",
    );
    const motionSource = readFileSync(
      join(process.cwd(), "lib/motion.ts"),
      "utf8",
    );

    expect(stage).toContain("useAnimationControls");
    expect(stage).toContain("stageControls.start(settleZoom)");
    expect(stage).toContain(
      "animate={prefersReducedMotion ? { opacity: 1 } : stageControls}",
    );
    expect(motionSource).toContain("configuratorStepVariants");
    expect(page).toContain("custom={stepDirection}");
    expect(page).toContain("configuratorStepVariants");
    expect(configuratorStepVariants.exit("forward")).toMatchObject({ x: -24 });
    expect(configuratorStepVariants.exit("back")).toMatchObject({ x: 24 });
  });

  it("preloads optimized image resources with their displayed size category", () => {
    const stage = readFileSync(
      join(process.cwd(), "components/configurator/stage.tsx"),
      "utf8",
    );
    const catalogue = readFileSync(
      join(process.cwd(), "lib/module-catalog.ts"),
      "utf8",
    );

    expect(stage).toContain("getImageProps");
    expect(stage).toContain("imageSrcset");
    expect(stage).toContain("imageSizes");
    expect(stage).toContain("configuratorImageSizes");
    expect(stage).toContain("dataset.configuratorImage");
    expect(catalogue).toContain("CONFIGURATOR_BACKDROP_SIZES");
    expect(catalogue).toContain("CONFIGURATOR_OBJECT_SIZES");
    expect(catalogue).toContain("configuratorImageSizes");

    for (const path of CONFIGURATOR_IMAGE_PATHS) {
      expect(configuratorImageSizes(path)).toBe(
        path.startsWith("/configurator/verticals/")
          ? CONFIGURATOR_BACKDROP_SIZES
          : CONFIGURATOR_OBJECT_SIZES,
      );
    }
  });

  it("keeps the single compact stage between controls and active step on mobile", () => {
    const page = readFileSync(
      join(process.cwd(), "app/configure/page.tsx"),
      "utf8",
    );
    const stepperIndex = page.indexOf("<ConfiguratorStepper");
    const stageIndex = page.indexOf("<ConfiguratorStage");
    const activeStepIndex = page.lastIndexOf("<AnimatePresence");

    expect(stepperIndex).toBeGreaterThan(-1);
    expect(stageIndex).toBeGreaterThan(stepperIndex);
    expect(activeStepIndex).toBeGreaterThan(stageIndex);
    expect(page).toContain("sticky top-2");
    expect(page).toContain("lg:col-start-2");
    expect(page).toContain("lg:row-span-2");
  });

  it("uses stable percentage slots for compact and staggered foreground scenes", () => {
    expect(sceneSlots(0)).toEqual([]);
    expect(sceneSlots(1)).toEqual([{ left: "27%", top: "16%", width: "46%" }]);
    expect(sceneSlots(4)).toEqual([
      { left: "12%", top: "25%", width: "16%" },
      { left: "32%", top: "25%", width: "16%" },
      { left: "52%", top: "25%", width: "16%" },
      { left: "72%", top: "25%", width: "16%" },
    ]);
    expect(sceneSlots(7)).toEqual([
      { left: "7%", top: "12%", width: "20%" },
      { left: "29%", top: "12%", width: "20%" },
      { left: "51%", top: "12%", width: "20%" },
      { left: "73%", top: "12%", width: "20%" },
      { left: "19%", top: "56%", width: "20%" },
      { left: "41%", top: "56%", width: "20%" },
      { left: "63%", top: "56%", width: "20%" },
    ]);
  });

  it("keeps every scene object inside the 3:2 frame and staggers seven through ten objects over two rows", () => {
    for (let count = 1; count <= 10; count += 1) {
      const slots = sceneSlots(count);
      expect(slots).toHaveLength(count);

      for (const slot of slots) {
        const left = Number.parseFloat(slot.left);
        const top = Number.parseFloat(slot.top);
        const width = Number.parseFloat(slot.width);

        expect(left + width).toBeLessThanOrEqual(100);
        expect(top + width * 1.5).toBeLessThanOrEqual(100);
      }
    }

    for (const count of [7, 8, 9, 10]) {
      expect(new Set(sceneSlots(count).map(({ top }) => top)).size).toBe(2);
    }
  });

  it("composes truthful decorative artwork inside one accessible scene", () => {
    const stage = readFileSync(
      join(process.cwd(), "components/configurator/stage.tsx"),
      "utf8",
    );

    expect(stage).toContain("sceneSlots");
    expect(stage).toContain('state.orgType === "SCHOOL"');
    expect(stage).toContain("SCHOOL_PREVIEW_VERTICALS");
    expect(stage).toContain('alt=""');
    expect(stage).toContain("aria-label={caption}");
    expect(stage).toContain(
      "School workspace preview showing Independent School, ACE School and State School.",
    );
    expect(stage).not.toContain("selectedModules.map");
    expect(stage).not.toContain("lg:grid-cols-3");
    expect(stage).toContain("layout={!prefersReducedMotion}");
    expect(stage).toContain(
      "prefersReducedMotion ? reducedMotionFade : springEnter",
    );
    expect(stage).toContain(
      "animate={prefersReducedMotion ? { opacity: 1 } : stageControls}",
    );
    expect(stage).toContain(
      "const slots = sceneSlots(foregroundLayers.length)",
    );
  });
});
