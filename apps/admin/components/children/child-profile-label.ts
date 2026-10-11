import type { OrgUiKey } from "../../lib/org-ui";

const PERSON_LABEL: Record<OrgUiKey, string> = {
  ACE_SCHOOL: "Student",
  INDEPENDENT_SCHOOL: "Student",
  STATE_SCHOOL: "Pupil",
  SCHOOL: "Student",
  NURSERY: "Child",
  CLUB: "Member",
  CHARITY: "Participant",
  CHURCH: "Child",
  UNKNOWN: "Child",
};

export function childProfileLabel(key: OrgUiKey): string {
  return PERSON_LABEL[key];
}
