export type FamilySection =
  | "attendance"
  | "sessions"
  | "subject-timetable"
  | "notices"
  | "messages"
  | "volunteering";

export const CHILD_SECTIONS: FamilySection[] = [
  "attendance",
  "sessions",
  "subject-timetable",
];

export function parentSectionsForSite(
  activePermissions: ReadonlySet<string>,
  hasStudentIdentity: boolean,
  isAceSchool: boolean,
): FamilySection[] {
  const sections = [...CHILD_SECTIONS];
  if (!hasStudentIdentity) {
    if (activePermissions.has("ace.parent.notices.read")) {
      sections.push("notices");
    }
    if (
      activePermissions.has("messaging.conversations.read") &&
      activePermissions.has("messaging.messages.read")
    ) {
      sections.push("messages");
    }
  }
  if (isAceSchool) sections.push("volunteering");
  return sections;
}
