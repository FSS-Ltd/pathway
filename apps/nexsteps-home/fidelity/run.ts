#!/usr/bin/env -S npx tsx
/**
 * NexSteps Home fidelity gate. For every screen ID in checklist.json,
 * renders the real Expo web export at both device viewports and
 * pixel-diffs it against the matching prototype baseline in
 * prototypes/nexsteps-home/baselines/. Wired as `pnpm test:fidelity`.
 *
 * Honest limitation: react-native-web is not native rendering. This gates
 * layout, spacing, type and colour drift on a real, deterministic render -
 * it is not a substitute for the iPhone/Pixel visual comparison design-
 * system.md's Visual QA section still asks for at release time.
 *
 * Skips the (slow) export/serve/browser steps entirely when the checklist
 * is empty - correct today (Plan 01's screens are placeholders, not
 * wireframe-matched implementations) and exercises the same code path the
 * moment a later plan adds its first real entry.
 */
import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { readFileSync, mkdirSync, existsSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { screenRoutes, type ScreenId } from "../src/screens/registry";
import { startServer } from "./serve-export.mjs";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const prototypeBaselines = path.resolve(appRoot, "../../prototypes/nexsteps-home/baselines");
const diffDir = path.join(appRoot, "fidelity", ".diffs");

// Matches prototypes/nexsteps-home/src/mobile/geometry.ts's screen dimensions.
const DEVICES = [
  { id: "iphone", width: 393, height: 852 },
  { id: "pixel-10", width: 427, height: 952 },
] as const;

// Chosen to absorb sub-pixel/anti-aliasing differences between a browser
// rendering the prototype and react-native-web rendering the app, not to
// mask real layout drift. Tune down as the harness proves itself; a
// looser threshold that lets real regressions through is worse than a
// slower, tighter one.
const PIXELMATCH_THRESHOLD = 0.1;
const MAX_DIFF_RATIO = 0.02; // 2% of pixels may differ before this fails

// The prototype's own baselines are off by up to 1px from their nominal
// geometry (browser subpixel rounding at scale:1 in PhoneFrame.tsx -
// confirmed empirically: iPhone baselines capture at 394px wide, not the
// documented 393). A real layout bug produces a much larger mismatch than
// this; tolerate only the capture tool's own imprecision, not genuine
// drift, by comparing the common cropped region.
const DIMENSION_TOLERANCE_PX = 2;

function cropToCommonSize(image: PNG, width: number, height: number): PNG {
  if (image.width === width && image.height === height) return image;
  const cropped = new PNG({ width, height });
  PNG.bitblt(image, cropped, 0, 0, width, height, 0, 0);
  return cropped;
}

type Checklist = { screenIds: ScreenId[] };

function loadChecklist(): ScreenId[] {
  const raw = readFileSync(path.join(appRoot, "fidelity/checklist.json"), "utf-8");
  const parsed = JSON.parse(raw) as Checklist;
  for (const id of parsed.screenIds) {
    if (!(id in screenRoutes)) {
      throw new Error(`fidelity/checklist.json lists unknown screen id "${id}".`);
    }
  }
  return parsed.screenIds;
}

async function diffOne(page: import("@playwright/test").Page, screenId: ScreenId, device: (typeof DEVICES)[number], baseUrl: string) {
  await page.setViewportSize({ width: device.width, height: device.height });
  await page.goto(`${baseUrl}${screenRoutes[screenId]}`, { waitUntil: "networkidle" });
  await page.evaluate(() => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready);

  const actualBuffer = await page.screenshot();
  const actual = PNG.sync.read(actualBuffer);

  const baselinePath = path.join(prototypeBaselines, device.id, `${screenId}.png`);
  if (!existsSync(baselinePath)) {
    throw new Error(`No baseline at ${baselinePath}. Run 'npm run capture:baselines' in prototypes/nexsteps-home first.`);
  }
  const expected = PNG.sync.read(readFileSync(baselinePath));

  const widthDiff = Math.abs(actual.width - expected.width);
  const heightDiff = Math.abs(actual.height - expected.height);
  if (widthDiff > DIMENSION_TOLERANCE_PX || heightDiff > DIMENSION_TOLERANCE_PX) {
    return {
      screenId,
      device: device.id,
      pass: false,
      reason: `dimension mismatch: actual ${actual.width}x${actual.height} vs baseline ${expected.width}x${expected.height}`,
    };
  }

  const width = Math.min(actual.width, expected.width);
  const height = Math.min(actual.height, expected.height);
  const actualCropped = cropToCommonSize(actual, width, height);
  const expectedCropped = cropToCommonSize(expected, width, height);

  const diff = new PNG({ width, height });
  const diffPixels = pixelmatch(actualCropped.data, expectedCropped.data, diff.data, width, height, {
    threshold: PIXELMATCH_THRESHOLD,
  });
  const diffRatio = diffPixels / (width * height);
  const pass = diffRatio <= MAX_DIFF_RATIO;

  if (!pass) {
    mkdirSync(diffDir, { recursive: true });
    const diffPath = path.join(diffDir, `${screenId}-${device.id}.png`);
    writeFileSync(diffPath, PNG.sync.write(diff));
    return { screenId, device: device.id, pass, reason: `${(diffRatio * 100).toFixed(2)}% of pixels differ (see ${diffPath})` };
  }

  return { screenId, device: device.id, pass, reason: `${(diffRatio * 100).toFixed(2)}% of pixels differ` };
}

async function main() {
  const screenIds = loadChecklist();

  if (screenIds.length === 0) {
    console.log("fidelity/checklist.json is empty - no screens are asserted to pixel-match yet. Passing.");
    return;
  }

  if (existsSync(diffDir)) rmSync(diffDir, { recursive: true, force: true });

  console.log(`Exporting web build (${screenIds.length} screen(s) to check)...`);
  execFileSync("npx", ["expo", "export", "-p", "web"], { cwd: appRoot, stdio: "inherit" });

  const port = Number(process.env.FIDELITY_SERVER_PORT ?? 4488);
  const server = await startServer(port);
  const baseUrl = `http://localhost:${port}`;

  const browser = await chromium.launch();
  const page = await browser.newPage();

  const results = [];
  for (const screenId of screenIds) {
    for (const device of DEVICES) {
      results.push(await diffOne(page, screenId, device, baseUrl));
    }
  }

  await browser.close();
  server.close();

  const failures = results.filter((r) => !r.pass);
  for (const result of results) {
    console.log(`${result.pass ? "PASS" : "FAIL"} ${result.screenId} (${result.device}): ${result.reason}`);
  }
  console.log(`${results.length - failures.length}/${results.length} checks passed.`);

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
