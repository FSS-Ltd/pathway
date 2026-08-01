import { readFileSync } from "node:fs";
import path from "node:path";

import { screenRoutes } from "./registry";

describe("screenRoutes", () => {
  const inventoryPath = path.resolve(
    __dirname,
    "../../../../docs/NexStepsV2/nexsteps-home/screen-inventory.json",
  );
  const inventory = JSON.parse(readFileSync(inventoryPath, "utf-8")) as {
    screens: Array<{ group: string; id: string }>;
  };
  const phoneInventoryIds = inventory.screens
    .filter((screen) => screen.group !== "tablet-two-pane")
    .map((screen) => screen.id);
  const tabletCompositeIds = inventory.screens
    .filter((screen) => screen.group === "tablet-two-pane")
    .map((screen) => screen.id);
  const registryIds = Object.keys(screenRoutes);

  it("covers every approved phone screen ID and no others", () => {
    expect(registryIds.sort()).toEqual([...phoneInventoryIds].sort());
  });

  it("keeps the five tablet composites out of the phone route registry", () => {
    expect(registryIds).toHaveLength(76);
    expect(phoneInventoryIds).toHaveLength(76);
    expect(tabletCompositeIds).toHaveLength(5);
  });

  it("every route path starts with a known top-level group", () => {
    for (const route of Object.values(screenRoutes)) {
      expect(route).toMatch(/^\/\((setup|home|moderation)\)\//);
    }
  });
});
