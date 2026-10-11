export type FamilyReadSection =
  | "attendance"
  | "homework"
  | "reports"
  | "slips"
  | "faith"
  | "notices"
  | "messages"
  | "finance";

export type FamilySectionResult<T> =
  | { status: "ready"; data: T }
  | { status: "unavailable" }
  | { status: "error"; message: string };

export const UNAVAILABLE_FAMILY_SECTIONS = {
  homework: { status: "unavailable" },
  reports: { status: "unavailable" },
  slips: { status: "unavailable" },
  faith: { status: "unavailable" },
  finance: { status: "unavailable" },
} as const satisfies Partial<
  Record<FamilyReadSection, FamilySectionResult<never>>
>;

export function isFamilySectionEnabled(
  section: "attendance" | "notices" | "messages",
): boolean {
  switch (section) {
    case "attendance":
      return process.env.ACE_FAMILY_FACADE_ATTENDANCE_ENABLED !== "false";
    case "notices":
      return process.env.ACE_FAMILY_FACADE_NOTICES_ENABLED !== "false";
    case "messages":
      return process.env.ACE_FAMILY_FACADE_MESSAGES_ENABLED !== "false";
  }
}
