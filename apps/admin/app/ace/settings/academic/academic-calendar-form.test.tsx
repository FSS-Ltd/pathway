import assert from "node:assert/strict";
import {
  academicCalendarPresentation,
  createInitialAcademicCalendarForm,
  getAcademicCalendarValidation,
  isAcademicCalendarKeyboardSubmit,
} from "./academic-calendar-form";

const completeForm = createInitialAcademicCalendarForm({
  name: "2026/27",
  startsOn: "2026-09-01",
  endsOn: "2027-07-31",
  reason: "Set the first academic calendar",
  periods: [{ name: "Autumn", startsOn: "2026-09-01", endsOn: "2026-12-18" }],
});

assert.deepEqual(
  academicCalendarPresentation({
    isLoading: true,
    academicYears: [],
    isSaving: false,
    error: null,
    success: null,
  }),
  { state: "loading", message: "Loading academic calendar…" },
  "shows an accessible loading state while the calendar is requested",
);

assert.deepEqual(
  academicCalendarPresentation({
    isLoading: false,
    academicYears: [],
    isSaving: false,
    error: null,
    success: null,
  }),
  { state: "empty", message: "No academic years have been set up." },
  "explains the empty calendar state",
);

assert.deepEqual(
  getAcademicCalendarValidation({
    ...completeForm,
    reason: "",
    periods: [
      {
        ...completeForm.periods[0],
        startsOn: "2027-08-01",
        endsOn: "2027-08-10",
      },
    ],
  }),
  {
    reason: "Enter a reason for this academic calendar.",
    periods: "Each period must fall within the academic year.",
  },
  "blocks an invalid submission before it reaches the server",
);

assert.deepEqual(
  academicCalendarPresentation({
    isLoading: false,
    academicYears: [],
    isSaving: false,
    error: "An active academic year already exists for this site.",
    success: null,
  }),
  {
    state: "error",
    message: "An active academic year already exists for this site.",
  },
  "presents server conflict feedback",
);

assert.deepEqual(
  academicCalendarPresentation({
    isLoading: false,
    academicYears: [],
    isSaving: true,
    error: null,
    success: null,
  }),
  { state: "saving", message: "Saving academic calendar…" },
  "communicates the pending save state",
);

assert.deepEqual(
  academicCalendarPresentation({
    isLoading: false,
    academicYears: [],
    isSaving: false,
    error: null,
    success: "Academic year saved.",
  }),
  { state: "success", message: "Academic year saved." },
  "announces a successful save",
);

assert.equal(
  isAcademicCalendarKeyboardSubmit({ key: "Enter", shiftKey: false }),
  true,
  "supports keyboard completion with Enter",
);
assert.equal(
  isAcademicCalendarKeyboardSubmit({ key: "Enter", shiftKey: true }),
  false,
  "does not treat Shift+Enter as a form completion shortcut",
);

console.log("academic-calendar-form.test.tsx: all assertions passed");
