import { readFileSync } from "node:fs";
import path from "node:path";

import { screenRoutes } from "./registry";

describe("screenRoutes", () => {
  const inventoryPath = path.resolve(
    __dirname,
    "../../../../docs/NexStepsV2/nexsteps-home/screen-inventory.json",
  );
  const inventory = JSON.parse(readFileSync(inventoryPath, "utf-8")) as {
    screens: Array<{ id: string }>;
  };
  const inventoryIds = inventory.screens.map((s) => s.id);
  const registryIds = Object.keys(screenRoutes);

  it("covers every approved screen ID and no others", () => {
    expect(registryIds.sort()).toEqual([...inventoryIds].sort());
  });

  it("has exactly 81 entries, matching the approved inventory", () => {
    expect(registryIds).toHaveLength(81);
    expect(inventoryIds).toHaveLength(81);
  });

  it("every route path starts with a known top-level group", () => {
    for (const route of Object.values(screenRoutes)) {
      expect(route).toMatch(/^\/\((setup|home|moderation)\)\//);
    }
  });
});
