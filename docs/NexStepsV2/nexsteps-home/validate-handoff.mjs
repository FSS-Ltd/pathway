import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const handoffDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(handoffDirectory, "../../..");
const inventoryPath = resolve(handoffDirectory, "screen-inventory.json");

const requiredFlowGroups = new Map([
  ["setup", 9],
  ["week-today", 8],
  ["progress", 9],
  ["community-families", 8],
  ["community-conversations", 5],
  ["community-meetups", 8],
  ["family-settings", 8],
  ["regulations-evidence", 17],
  ["moderation", 4],
  ["tablet-two-pane", 5],
]);

const requiredScreenIds = [
  "welcome",
  "setup-complete",
  "week-home",
  "today",
  "progress-overview",
  "community-preview",
  "family-directory",
  "private-intro",
  "meetup-list",
  "family-children",
  "regulations-jurisdiction",
  "regulations-overview",
  "regulations-pack-preview",
  "regulations-share-activity",
  "moderation-queue",
  "tablet-week-day",
];

const requiredHandoffFiles = [
  "README.md",
  "product-contract.md",
  "implementation-map.md",
  "design-system.md",
  "acceptance-criteria.md",
  "community-user-flows.md",
  "regulations-and-evidence.md",
  "approved-screens/reference-welcome.jpg",
  "approved-screens/nexsteps-home-community-preview.jpg",
  "approved-screens/regulations-jurisdiction-pixel.jpg",
  "approved-screens/regulations-overview.jpg",
  "approved-screens/regulations-pack-preview-iphone.jpg",
  "approved-screens/regulations-pack-preview-pixel.jpg",
  "approved-screens/regulations-style-comparison.png",
];

const requiredPrototypeFiles = [
  "prototypes/nexsteps-home/README.md",
  "prototypes/nexsteps-home/package.json",
  "prototypes/nexsteps-home/mobile-runtime.lock.json",
  "prototypes/nexsteps-home/public/nexsteps-logo.svg",
  "prototypes/nexsteps-home/scripts/check-wireframes.mjs",
  "prototypes/nexsteps-home/src/Prototype.tsx",
  "prototypes/nexsteps-home/src/regulations-wireframes.ts",
  "prototypes/nexsteps-home/src/wireframe-types.ts",
  "prototypes/nexsteps-home/src/wireframes-data.ts",
];

const errors = [];

function requireFile(path, label) {
  if (!existsSync(path)) {
    errors.push(`Missing ${label}: ${path}`);
  }
}

for (const relativePath of requiredHandoffFiles) {
  requireFile(resolve(handoffDirectory, relativePath), "handoff file");
}

for (const relativePath of requiredPrototypeFiles) {
  requireFile(resolve(repositoryRoot, relativePath), "prototype file");
}

requireFile(inventoryPath, "screen inventory");

if (existsSync(inventoryPath)) {
  let inventory;

  try {
    inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
  } catch (error) {
    errors.push(`Screen inventory is not valid JSON: ${error.message}`);
  }

  if (inventory) {
    if (inventory.schemaVersion !== 1) {
      errors.push("screen-inventory.json must use schemaVersion 1.");
    }

    if (inventory.product !== "NexSteps Home") {
      errors.push('screen-inventory.json product must be "NexSteps Home".');
    }

    if (!Array.isArray(inventory.flowGroups)) {
      errors.push("screen-inventory.json flowGroups must be an array.");
    }

    if (!Array.isArray(inventory.screens)) {
      errors.push("screen-inventory.json screens must be an array.");
    }

    if (
      Array.isArray(inventory.flowGroups) &&
      Array.isArray(inventory.screens)
    ) {
      if (inventory.flowGroups.length !== requiredFlowGroups.size) {
        errors.push(
          `Expected ${requiredFlowGroups.size} flow groups, found ${inventory.flowGroups.length}.`,
        );
      }

      if (inventory.screens.length !== 81) {
        errors.push(`Expected 81 screens, found ${inventory.screens.length}.`);
      }

      const screenIds = inventory.screens.map((screen) => screen.id);
      const uniqueScreenIds = new Set(screenIds);

      if (uniqueScreenIds.size !== screenIds.length) {
        errors.push("Screen IDs must be unique.");
      }

      for (const requiredScreenId of requiredScreenIds) {
        if (!uniqueScreenIds.has(requiredScreenId)) {
          errors.push(`Missing required screen: ${requiredScreenId}.`);
        }
      }

      for (const [groupId, expectedCount] of requiredFlowGroups) {
        const group = inventory.flowGroups.find(
          (candidate) => candidate.id === groupId,
        );
        const screensInGroup = inventory.screens.filter(
          (screen) => screen.group === groupId,
        );

        if (!group) {
          errors.push(`Missing flow group: ${groupId}.`);
          continue;
        }

        if (screensInGroup.length !== expectedCount) {
          errors.push(
            `Flow group ${groupId} must contain ${expectedCount} screens; found ${screensInGroup.length}.`,
          );
        }

        const declaredScreenIds = Array.isArray(group.screenIds)
          ? group.screenIds
          : [];
        const actualScreenIds = screensInGroup.map((screen) => screen.id);

        if (
          JSON.stringify(declaredScreenIds) !== JSON.stringify(actualScreenIds)
        ) {
          errors.push(
            `Flow group ${groupId} screenIds do not match the screen inventory order.`,
          );
        }
      }

      for (const screen of inventory.screens) {
        if (!requiredFlowGroups.has(screen.group)) {
          errors.push(
            `Screen ${screen.id} uses unknown flow group ${screen.group}.`,
          );
        }

        if (!screen.title || typeof screen.title !== "string") {
          errors.push(`Screen ${screen.id} must have a title.`);
        }

        const targets = [
          screen.primaryTarget,
          ...(Array.isArray(screen.targets) ? screen.targets : []),
        ].filter(Boolean);

        for (const target of targets) {
          if (!uniqueScreenIds.has(target)) {
            errors.push(
              `Screen ${screen.id} links to unknown target ${target}.`,
            );
          }
        }
      }
    }
  }
}

for (const relativePath of requiredHandoffFiles.filter((path) =>
  path.endsWith(".md"),
)) {
  const path = resolve(handoffDirectory, relativePath);
  if (!existsSync(path)) {
    continue;
  }

  const markdown = readFileSync(path, "utf8");

  if (markdown.includes("/Users/")) {
    errors.push(`${relativePath} contains a machine-specific absolute path.`);
  }

  for (const match of markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const link = match[1].trim();

    if (
      link.startsWith("#") ||
      link.startsWith("http://") ||
      link.startsWith("https://") ||
      link.startsWith("mailto:")
    ) {
      continue;
    }

    const relativeTarget = decodeURIComponent(link.split("#", 1)[0]);
    if (!relativeTarget) {
      continue;
    }

    const targetPath = resolve(dirname(path), relativeTarget);
    if (!existsSync(targetPath)) {
      errors.push(`${relativePath} links to missing target: ${link}`);
    }
  }
}

if (errors.length > 0) {
  console.error("NexSteps Home handoff validation failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  "Validated NexSteps Home handoff: 81 screens across 10 flow groups.",
);
