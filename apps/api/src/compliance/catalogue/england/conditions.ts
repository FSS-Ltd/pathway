import type { Condition } from "../conditions";
export const independentSchool: Condition = {
  any: [
    { field: "providerCategory", op: "eq", value: "INDEPENDENT_SCHOOL" },
    { field: "schoolCategory", op: "eq", value: "INDEPENDENT" },
  ],
};
export const stateSchool: Condition = {
  any: [
    { field: "providerCategory", op: "eq", value: "STATE_SCHOOL" },
    { field: "schoolCategory", op: "eq", value: "MAINTAINED" },
    { field: "schoolCategory", op: "eq", value: "ACADEMY" },
  ],
};
export const school: Condition = { any: [independentSchool, stateSchool] };
export const earlyYears: Condition = {
  field: "eyfsApplies",
  op: "eq",
  value: true,
};
