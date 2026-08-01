#!/usr/bin/env node
/**
 * Captures every approved wireframe screen at both device presets as PNG
 * baselines for the NexSteps Home fidelity gate (build-plan Plan 02).
 *
 * Navigates the prototype's own review controls (Next/Previous arrows,
 * ReviewBar) rather than any URL-based deep link - the prototype has none,
 * and adding one would be more surface area than a one-off capture script
 * needs. `[data-testid="wireframe-screen"]`'s `data-screen-id` attribute
 * (added alongside this script, in Prototype.tsx - an unprotected file)
 * is read after every navigation so a screen never gets captured under
 * the wrong filename, even if the click-through ever desyncs from the
 * expected array order.
 *
 * The browser viewport (900x1200) is sized so PhoneFrame's scale factor
 * (see src/mobile/PhoneFrame.tsx) computes to exactly 1 for both device
 * presets - device.width/height (511x968 iPhone, 566x1022 Pixel) each fit
 * with the 48px stage margin to spare, so `[data-testid="device-screen"]`
 * renders at its literal geometry size (393x852 iPhone, 427x952 Pixel),
 * not a downscaled fit.
 */
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "baselines");
const BASE_URL = process.env.CAPTURE_BASE_URL ?? "http://localhost:5183";
const TOTAL_SCREENS = 76;

const devices = [
  { id: "iphone", testId: "device-option-iphone" },
  { id: "pixel-10", testId: "device-option-pixel-10" },
];

async function selectDevice(page, device) {
  if (device.id === "iphone") return; // default on load
  await page.click('[data-testid="device-picker"]');
  await page.click(`[data-testid="${device.testId}"]`);
  // Radix closes the menu on select; wait for the bezel image to update.
  await page.waitForFunction(
    (expected) => document.querySelector('[data-testid="phone-frame"]')?.getAttribute("data-device") === expected,
    device.id,
  );
}

async function captureDevice(page, device) {
  const deviceDir = path.join(outDir, device.id);
  mkdirSync(deviceDir, { recursive: true });

  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  // The fake fingertip cursor (src/mobile/MobileCursor.tsx) turns visible
  // on the first pointer move and, unlike a real cursor, never leaves -
  // Playwright's clicks fire pointermove without ever firing pointerleave,
  // so it parks at the last click position for every screenshot after the
  // first. It has no role in hit-testing; hiding it once for the whole
  // capture is safe and avoids toggling it 76 times per device.
  await page.addStyleTag({ content: '[data-testid="mobile-cursor"] { display: none !important; }' });
  await selectDevice(page, device);

  const captured = [];
  const seen = new Set();

  for (let i = 0; i < TOTAL_SCREENS; i += 1) {
    const screenId = await page.getAttribute('[data-testid="wireframe-screen"]', "data-screen-id");
    if (!screenId) throw new Error(`Screen ${i} on ${device.id} has no data-screen-id.`);
    if (seen.has(screenId)) {
      throw new Error(
        `Cycled back to an already-captured screen ("${screenId}") after only ${i} steps on ${device.id} - the review-bar Next control may not be advancing.`,
      );
    }
    seen.add(screenId);

    // The review bar (Previous/All screens/Next) is prototype-only
    // browsing chrome, rendered as the first child of .screen-content
    // ahead of its own 58px top padding - it does not exist in the real
    // app and must not appear in (or leave a gap in) a baseline meant to
    // be diffed against it. display:none collapses its space so content
    // renders at its true production position; it is restored to normal
    // flow immediately after the screenshot so the Next click below still
    // has a visible, clickable target.
    await page.evaluate(() => {
      const bar = document.querySelector(".review-bar");
      if (bar instanceof HTMLElement) bar.style.display = "none";
    });
    await page.locator('[data-testid="device-screen"]').screenshot({
      path: path.join(deviceDir, `${screenId}.png`),
    });
    await page.evaluate(() => {
      const bar = document.querySelector(".review-bar");
      if (bar instanceof HTMLElement) bar.style.display = "";
    });
    captured.push(screenId);

    if (i < TOTAL_SCREENS - 1) {
      await page.click('[aria-label="Next wireframe"]');
      await page.waitForFunction(
        (previousId) =>
          document.querySelector('[data-testid="wireframe-screen"]')?.getAttribute("data-screen-id") !== previousId,
        screenId,
      );
    }
  }

  return captured;
}

async function run() {
  if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });

  const manifest = {};
  for (const device of devices) {
    console.log(`Capturing ${TOTAL_SCREENS} screens for ${device.id}...`);
    manifest[device.id] = await captureDevice(page, device);
    console.log(`  ${manifest[device.id].length} screens captured.`);
  }

  await browser.close();

  for (const device of devices) {
    if (manifest[device.id].length !== TOTAL_SCREENS) {
      throw new Error(
        `Expected ${TOTAL_SCREENS} screens for ${device.id}, captured ${manifest[device.id].length}.`,
      );
    }
  }

  writeFileSync(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Baselines written to ${path.relative(process.cwd(), outDir)}/`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
