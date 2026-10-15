/**
 * NexSteps 2.0 platform vertical, superset of Sector (@pathway/db Vertical enum).
 * Kept as a plain string union here (rather than importing the Prisma enum) so this
 * package stays dependency-free for frontend use — same rationale as sector.ts.
 */
export type Vertical =
  | "CHURCH"
  | "INDEPENDENT_SCHOOL"
  | "ACE_SCHOOL"
  | "STATE_SCHOOL"
  | "NURSERY"
  | "CHARITY"
  | "CLUB"
  | "HOME_EDUCATION"
  | "ACE_LEARNING_CENTRE"
  | "PUBLIC_LEARNING_CENTRE";

export const VERTICAL_LABELS: Record<Vertical, string> = {
  CHURCH: "Church",
  INDEPENDENT_SCHOOL: "Independent School",
  ACE_SCHOOL: "ACE School",
  STATE_SCHOOL: "State School",
  NURSERY: "Nursery",
  CHARITY: "Charity",
  CLUB: "Club",
  HOME_EDUCATION: "Home Education",
  ACE_LEARNING_CENTRE: "ACE Learning Centre",
  PUBLIC_LEARNING_CENTRE: "Public Learning Centre",
};

export const VERTICAL_OPTIONS: { value: Vertical; label: string }[] = (
  Object.keys(VERTICAL_LABELS) as Vertical[]
).map((value) => ({ value, label: VERTICAL_LABELS[value] }));

export function isVertical(value: unknown): value is Vertical {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(VERTICAL_LABELS, value)
  );
}
