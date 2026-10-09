import type { SaveStudentTimetableDraftDto } from "./dto/ace-subject-timetable.dto";

type TimetableDay = SaveStudentTimetableDraftDto["entries"][number]["day"];

interface SnapshotSchedule {
  teachingDays: readonly TimetableDay[];
  slots: ReadonlyArray<{
    id: string;
    position: number;
    kind: "LESSON" | "BREAK";
    label: string;
    startMinutes: number;
    endMinutes: number;
  }>;
}

export function buildTimetableSnapshot(
  tenantId: string,
  schedule: SnapshotSchedule,
  assignments: ReadonlyArray<{
    day: TimetableDay;
    slotId: string;
    subjectId: string;
  }>,
  subjects: ReadonlyMap<string, { name: string; color: string | null }>,
) {
  const byCell = new Map(
    assignments.map((entry) => [
      `${entry.day}:${entry.slotId}`,
      entry.subjectId,
    ]),
  );
  const entries = schedule.teachingDays.flatMap((day) =>
    schedule.slots.map((slot) => {
      const subjectId =
        slot.kind === "LESSON" ? byCell.get(`${day}:${slot.id}`) : undefined;
      const subject = subjectId ? subjects.get(subjectId) : undefined;
      return {
        tenantId,
        day,
        slotPosition: slot.position,
        slotKind: slot.kind,
        slotLabel: slot.label,
        startMinutes: slot.startMinutes,
        endMinutes: slot.endMinutes,
        subjectId: subjectId ?? null,
        subjectName: subject?.name ?? null,
        subjectColor: subject?.color ?? null,
      };
    }),
  );
  return {
    entries,
    unassignedLessonCount: entries.filter(
      (entry) => entry.slotKind === "LESSON" && !entry.subjectId,
    ).length,
  };
}
