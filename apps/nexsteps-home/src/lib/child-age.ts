/**
 * child-add (Plan 05) only collects a whole-number age, matching the
 * approved wireframe - but /children's createChildSchema stores
 * dateOfBirth, not age (no plain age column exists). Approximates a
 * birthdate as 1 January of the birth year; exact day is unknowable from
 * an age alone and isn't asked for.
 */
export function ageToDateOfBirth(age: number, from = new Date()): string {
  const birthYear = from.getFullYear() - age;
  return `${birthYear}-01-01`;
}
