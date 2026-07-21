import { Vertical, Module } from "@prisma/client";
import { VERTICAL_CAPABILITIES, MODULE_CAPABILITIES } from "../capability-maps";

describe("capability maps completeness", () => {
  it("every vertical grants at least one capability", () => {
    for (const v of Object.values(Vertical)) {
      expect(VERTICAL_CAPABILITIES[v]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("every module grants at least one capability", () => {
    for (const m of Object.values(Module)) {
      expect(MODULE_CAPABILITIES[m]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("gives the Learning module its learning capabilities", () => {
    expect(MODULE_CAPABILITIES.LEARNING).toEqual([
      "learning.log.read",
      "learning.log.write",
      "learning.evidence.read",
      "learning.evidence.write",
      "learning.reports.generate",
    ]);
  });
});
