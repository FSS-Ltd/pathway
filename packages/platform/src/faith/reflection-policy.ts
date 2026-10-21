export type ReflectionVisibility = "AUTHOR_AND_STAFF" | "RELEASED_GUARDIANS";
export type ReflectionModerationStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface ReflectionAccessState {
  studentIdentityId: string;
  visibility: ReflectionVisibility;
  moderationStatus: ReflectionModerationStatus;
  guardianReleasedAt: Date | null;
}

export type ReflectionReader =
  | { kind: "STAFF" }
  | { kind: "STUDENT"; studentIdentityId: string }
  | { kind: "GUARDIAN"; hasCurrentFullRelationship: boolean };

export function canReadReflection(
  reflection: ReflectionAccessState,
  reader: ReflectionReader,
): boolean {
  if (reader.kind === "STAFF") return true;
  if (reader.kind === "STUDENT") {
    return reader.studentIdentityId === reflection.studentIdentityId;
  }
  return (
    reader.hasCurrentFullRelationship &&
    reflection.visibility === "RELEASED_GUARDIANS" &&
    reflection.moderationStatus === "APPROVED" &&
    reflection.guardianReleasedAt !== null
  );
}

export function canReleaseReflection(
  reflection: ReflectionAccessState,
): boolean {
  return (
    reflection.moderationStatus === "APPROVED" &&
    reflection.visibility === "AUTHOR_AND_STAFF" &&
    reflection.guardianReleasedAt === null
  );
}
