import {
  isSector,
  isVertical,
  institutionalSector,
  verticalScreen,
} from "@pathway/types";
import {
  stepsFor,
  INITIAL_CONFIGURATION,
  nextStep as nextInstitutionalStep,
} from "../app/configure/institutional-flow";
import {
  INITIAL_CONFIGURATOR_STATE,
  selectOrgType,
  selectVertical,
  nextStep,
  prevStep,
} from "../app/configure/state";
import { buildCheckoutPayload } from "../lib/configurator-checkout";
import { verticalImagePath, VERTICAL_FEATURES } from "../lib/module-catalog";

describe("learning centre configuration", () => {
  it.each([
    ["ACE_LEARNING_CENTRE", "ACE_SCHOOL"],
    ["PUBLIC_LEARNING_CENTRE", "STATE_SCHOOL"],
  ] as const)(
    "retains %s identity while reusing %s screens",
    (vertical, screen) => {
      const selected = selectOrgType(
        {
          ...INITIAL_CONFIGURATOR_STATE,
          step: "org-type",
          planCode: "STARTER_49_MONTHLY",
        },
        "LEARNING_CENTRE",
      );
      expect(selected.vertical).toBeNull();
      expect(nextStep(selected).step).toBe("vertical");
      const setting = selectVertical(nextStep(selected), vertical);
      expect(nextStep(setting).step).toBe("included");
      expect(prevStep(nextStep(setting)).step).toBe("vertical");
      expect(selectVertical(setting, "STATE_SCHOOL").vertical).toBe(vertical);
      expect(verticalScreen(vertical)).toBe(screen);
      expect(institutionalSector(vertical)).toBe("LEARNING_CENTRE");
      expect(verticalImagePath(vertical)).toBe(verticalImagePath(screen));
      expect(VERTICAL_FEATURES[vertical]).toEqual(VERTICAL_FEATURES[screen]);
      expect(
        buildCheckoutPayload(setting, {
          organisationName: "Centre",
          contactName: "Contact",
          workEmail: "contact@example.test",
          password: "test-password",
        }),
      ).toMatchObject({ sector: "LEARNING_CENTRE", vertical });
    },
  );

  it("requires a setting in the live institutional flow", () => {
    expect(stepsFor("LEARNING_CENTRE")).toContain("setting");
    expect(
      nextInstitutionalStep({
        ...INITIAL_CONFIGURATION,
        orgType: "LEARNING_CENTRE",
        step: "organisation",
      }),
    ).toBe("setting");
    expect(stepsFor("CHURCH")).not.toContain("setting");
  });

  it("does not accept inherited object properties as persisted identity values", () => {
    for (const input of ["toString", "constructor", "__proto__", null]) {
      expect(isVertical(input)).toBe(false);
      expect(isSector(input)).toBe(false);
    }
  });
});
