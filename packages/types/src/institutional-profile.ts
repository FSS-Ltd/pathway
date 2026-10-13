import type { Sector } from "./sector";
import type { Vertical } from "./vertical";

export const INSTITUTIONAL_VERTICALS = [
  "CHURCH",
  "INDEPENDENT_SCHOOL",
  "ACE_SCHOOL",
  "STATE_SCHOOL",
  "NURSERY",
  "CHARITY",
  "CLUB",
  "ACE_LEARNING_CENTRE",
  "PUBLIC_LEARNING_CENTRE",
] as const satisfies readonly Vertical[];
export type InstitutionalVertical = (typeof INSTITUTIONAL_VERTICALS)[number];
export type VerticalScreen = Exclude<
  Vertical,
  "ACE_LEARNING_CENTRE" | "PUBLIC_LEARNING_CENTRE"
>;

/** Screen reuse never changes the stored provider identity or legal status. */
export function verticalScreen(
  vertical: InstitutionalVertical,
): Exclude<VerticalScreen, "HOME_EDUCATION">;
export function verticalScreen(vertical: Vertical): VerticalScreen;
export function verticalScreen(vertical: Vertical): VerticalScreen {
  if (vertical === "ACE_LEARNING_CENTRE") return "ACE_SCHOOL";
  if (vertical === "PUBLIC_LEARNING_CENTRE") return "STATE_SCHOOL";
  return vertical;
}

export function isAceVertical(vertical: unknown): boolean {
  return vertical === "ACE_SCHOOL" || vertical === "ACE_LEARNING_CENTRE";
}

export function institutionalSector(vertical: InstitutionalVertical): Sector {
  if (
    vertical === "ACE_LEARNING_CENTRE" ||
    vertical === "PUBLIC_LEARNING_CENTRE"
  )
    return "LEARNING_CENTRE";
  if (vertical === "CHURCH" || vertical === "CLUB" || vertical === "CHARITY")
    return vertical;
  return "SCHOOL";
}
