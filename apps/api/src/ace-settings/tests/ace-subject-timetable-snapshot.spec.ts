import { buildTimetableSnapshot } from "../ace-subject-timetable-snapshot";
import {
  saveStudentTimetableDraftSchema,
  saveTimetableScheduleSchema,
} from "../dto/ace-subject-timetable.dto";

describe("ACE subject timetable validation and snapshot", () => {
  it("rejects overlapping slots, repeated weekdays, and duplicate lesson cells", () => {
    const schedule = saveTimetableScheduleSchema.safeParse({
      expectedUpdatedAt: null,
      teachingDays: ["TUESDAY", "TUESDAY"],
      slots: [
        { kind: "LESSON", label: "First", startMinutes: 540, endMinutes: 600 },
        { kind: "BREAK", label: "Break", startMinutes: 590, endMinutes: 630 },
      ],
      reason: "Create schedule",
    });
    expect(schedule.success).toBe(false);
    if (!schedule.success) {
      expect(
        schedule.error.issues.map((issue) => issue.path.join(".")),
      ).toEqual(
        expect.arrayContaining(["teachingDays", "slots.1.startMinutes"]),
      );
    }
    const assignment = {
      day: "TUESDAY",
      slotId: "00000000-0000-0000-0000-000000000001",
      subjectId: "00000000-0000-0000-0000-000000000002",
    };
    expect(
      saveStudentTimetableDraftSchema.safeParse({
        scheduleId: "00000000-0000-0000-0000-000000000003",
        scheduleUpdatedAt: "2026-10-09T09:00:00.000Z",
        expectedVersion: 0,
        entries: [assignment, assignment],
        reason: "Assign subjects",
      }).success,
    ).toBe(false);
  });

  it("copies each teaching day and slot while counting only empty lessons", () => {
    const snapshot = buildTimetableSnapshot(
      "site-a",
      {
        teachingDays: ["TUESDAY", "THURSDAY"],
        slots: [
          {
            id: "lesson",
            position: 0,
            kind: "LESSON",
            label: "Morning",
            startMinutes: 540,
            endMinutes: 600,
          },
          {
            id: "break",
            position: 1,
            kind: "BREAK",
            label: "Break",
            startMinutes: 600,
            endMinutes: 615,
          },
        ],
      },
      [{ day: "TUESDAY", slotId: "lesson", subjectId: "reading" }],
      new Map([["reading", { name: "Reading", color: "#2760A8" }]]),
    );
    expect(snapshot.entries).toHaveLength(4);
    expect(snapshot.unassignedLessonCount).toBe(1);
    expect(snapshot.entries[0]).toMatchObject({
      day: "TUESDAY",
      slotKind: "LESSON",
      subjectName: "Reading",
      subjectColor: "#2760A8",
    });
    expect(snapshot.entries[1]).toMatchObject({
      slotKind: "BREAK",
      subjectId: null,
    });
    expect(snapshot.entries[2]).toMatchObject({
      day: "THURSDAY",
      slotKind: "LESSON",
      subjectName: null,
    });
  });
});
