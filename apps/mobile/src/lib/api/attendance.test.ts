import { apiClient, ApiError } from "./client";
import {
  fetchAttendanceSessionDetail,
  saveAttendanceSession,
} from "./attendance";

const response = {
  session: {
    id: "session/1",
    title: "Morning register",
    startsAt: "2026-08-12T08:30:00.000Z",
    endsAt: "2026-08-12T09:00:00.000Z",
    groupIds: ["group-1"],
    ageGroupLabel: "Year 4",
  },
  children: [
    { id: "child-1", displayName: "Jordan Smith" },
    { id: "child-2", displayName: "Alex Morgan" },
  ],
  rows: [
    {
      id: "attendance-1",
      childId: "child-1",
      present: true,
      status: "LATE" as const,
      timestamp: "2026-08-12T08:31:00.000Z",
    },
    {
      id: "attendance-2",
      childId: "child-2",
      present: false,
      timestamp: "2026-08-12T08:31:00.000Z",
    },
  ],
};

afterEach(() => {
  jest.restoreAllMocks();
});

it("prefers authoritative status while retaining the legacy present fallback", async () => {
  jest.spyOn(apiClient, "request").mockResolvedValue(response);

  const detail = await fetchAttendanceSessionDetail("session/1");

  expect(apiClient.request).toHaveBeenCalledWith(
    "/attendance/session/session%2F1",
    { method: "GET" },
  );
  expect(detail.childStatusRows).toEqual([
    {
      attendanceId: "attendance-1",
      childId: "child-1",
      childName: "Jordan Smith",
      status: "late",
    },
    {
      attendanceId: "attendance-2",
      childId: "child-2",
      childName: "Alex Morgan",
      status: "absent",
    },
  ]);
  expect(detail.summary).toEqual({
    present: 0,
    absent: 1,
    late: 1,
    unknown: 0,
  });
});

it("sends the exact status DTO and trims correction reasons without inventing an idempotency field", async () => {
  jest.spyOn(apiClient, "request").mockResolvedValue(response);

  await saveAttendanceSession("session/1", [
    {
      childId: "child-1",
      status: "LATE",
      correctionReason: "  Bus arrived late  ",
    },
    { childId: "child-2", status: "PRESENT" },
  ]);

  expect(apiClient.request).toHaveBeenCalledWith(
    "/attendance/session/session%2F1",
    {
      method: "PUT",
      body: JSON.stringify({
        rows: [
          {
            childId: "child-1",
            status: "LATE",
            correctionReason: "Bus arrived late",
          },
          { childId: "child-2", status: "PRESENT" },
        ],
      }),
    },
  );
});

it("classifies a 4xx response as a confirmed attendance rejection", async () => {
  jest
    .spyOn(apiClient, "request")
    .mockRejectedValue(new ApiError("validation failed", 422, "{}"));

  await expect(
    saveAttendanceSession("session/1", [
      { childId: "child-1", status: "LATE" },
    ]),
  ).rejects.toMatchObject({
    name: "AttendanceSaveError",
    outcome: "rejected",
    status: 422,
  });
});

it("classifies a transport failure as an unknown attendance outcome", async () => {
  jest
    .spyOn(apiClient, "request")
    .mockRejectedValue(new Error("Connection interrupted."));

  await expect(
    saveAttendanceSession("session/1", [
      { childId: "child-1", status: "LATE" },
    ]),
  ).rejects.toMatchObject({
    name: "AttendanceSaveError",
    outcome: "unknown",
    status: null,
  });
});
