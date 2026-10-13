export type StudentOverviewTab =
  | "overview"
  | "attendance"
  | "academics"
  | "contacts"
  | "registration"
  | "pace"
  | "behaviour"
  | "discipline"
  | "merits"
  | "notes";

export type StudentOverviewAction =
  | "edit-profile"
  | "manage-pace"
  | "view-registration";

export type StudentOverviewSection<T> =
  | { status: "ready"; data: T }
  | { status: "empty" }
  | { status: "unavailable"; reason: string }
  | { status: "error" };

export interface StudentOverviewResponse {
  identity: {
    id: string;
    firstName: string;
    lastName: string;
    preferredName: string | null;
    yearGroup: string | null;
    groupName: string | null;
    status: "enrolled" | "not-enrolled" | "unknown";
  };
  period: {
    from: string;
    to: string;
    label: string;
    source: "academic-year" | "last-30-days";
  };
  tabs: StudentOverviewTab[];
  actions: StudentOverviewAction[];
  sections: {
    attendance: StudentOverviewSection<{
      total: number;
      present: number;
      absent: number;
      late: number;
      attendanceRate: number;
    }>;
    academics: StudentOverviewSection<{
      reports: Array<{
        periodName: string;
        publishedAt: string;
        summary: string | null;
      }>;
    }>;
    pace: StudentOverviewSection<{
      subjects: Array<{
        subjectId: string;
        subjectName: string;
        currentPace: number;
        targetPace: number;
        completedPaces: number;
        trackStatus: string | null;
      }>;
    }>;
    behaviour: StudentOverviewSection<{
      merits: number;
      demerits: number;
      general: number;
    }>;
    discipline: StudentOverviewSection<{
      stage: number;
      stageLabel: string;
    }>;
    merits: StudentOverviewSection<{
      count: number;
      points: number;
    }>;
  };
}
