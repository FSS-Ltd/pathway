export type AdminAttendanceSaveOutcome = "rejected" | "unknown";

export class AdminAttendanceSaveError extends Error {
  constructor(
    readonly outcome: AdminAttendanceSaveOutcome,
    readonly status: number | null,
  ) {
    super(
      outcome === "rejected"
        ? "The server rejected the attendance update."
        : "The attendance save outcome is unknown.",
    );
    this.name = "AdminAttendanceSaveError";
  }
}
