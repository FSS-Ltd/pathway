import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import * as ReactNative from "react-native";

import * as attendanceApi from "@/lib/api/attendance";
import * as sessionsApi from "@/lib/api/sessions";
import { AttendanceScreen } from "./attendance-screen";

jest.mock("expo-router", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  return {
    useFocusEffect: (effect: () => void | (() => void)) =>
      React.useEffect(effect, [effect]),
    useLocalSearchParams: () => ({ sessionId: "session/1" }),
    useRouter: () => ({ push: jest.fn() }),
  };
});

jest.mock("@/components/primitives/brand-logo", () => ({
  BrandLogo: () => null,
}));

jest.mock("@/hooks/use-app-ready", () => ({
  useAppReady: () => ({ bootstrapState: null }),
}));

const initialDetail: attendanceApi.AttendanceSessionDetail = {
  session: {
    id: "session/1",
    title: "Morning register",
    startsAt: "2026-08-12T08:30:00.000Z",
    endsAt: "2026-08-12T09:00:00.000Z",
    groupIds: ["group-1"],
    ageGroupLabel: "Year 4",
  },
  children: [{ id: "child-1", displayName: "Jordan Smith" }],
  rows: [
    {
      id: "attendance-1",
      childId: "child-1",
      present: false,
      status: "ABSENT",
      timestamp: "2026-08-12T08:31:00.000Z",
    },
  ],
  childStatusRows: [
    {
      attendanceId: "attendance-1",
      childId: "child-1",
      childName: "Jordan Smith",
      status: "absent",
    },
  ],
  summary: { present: 0, absent: 1, late: 0, unknown: 0 },
  progressStatus: "completed",
  timingStatus: "live",
};

const correctedDetail: attendanceApi.AttendanceSessionDetail = {
  ...initialDetail,
  rows: [{ ...initialDetail.rows[0], status: "LATE", present: true }],
  childStatusRows: [{ ...initialDetail.childStatusRows[0], status: "late" }],
  summary: { present: 0, absent: 0, late: 1, unknown: 0 },
};

beforeEach(() => {
  jest.spyOn(ReactNative, "useWindowDimensions").mockReturnValue({
    width: 320,
    height: 640,
    scale: 2,
    fontScale: 2,
  });
  jest
    .spyOn(attendanceApi, "fetchAttendanceSessionDetail")
    .mockResolvedValue(initialDetail);
  jest
    .spyOn(sessionsApi, "fetchSessionDetail")
    .mockRejectedValue(new Error("Supplementary detail unavailable"));
});

afterEach(() => {
  jest.restoreAllMocks();
});

it("keeps saved status authoritative with non-colour 44-point controls at 320pt and 200% text", async () => {
  const screen = render(<AttendanceScreen />);
  await waitFor(() => expect(screen.getByText("Jordan Smith")).toBeTruthy());

  const late = screen.getByLabelText("Jordan Smith: Late");
  expect(late.props.accessibilityRole).toBe("radio");
  expect(late.props.accessibilityState.selected).toBe(false);
  expect(StyleSheet.flatten(late.props.style).minHeight).toBeGreaterThanOrEqual(
    44,
  );
  expect(screen.getByText("Late").props.numberOfLines).toBeUndefined();
  expect(screen.getByText("Saved: Absent")).toBeTruthy();
  expect(screen.getByLabelText("0 saved late")).toBeTruthy();

  fireEvent.press(screen.getByLabelText("Jordan Smith: Absent"));
  expect(
    screen.queryByLabelText("Correction reason for Jordan Smith"),
  ).toBeNull();
  expect(
    screen.getByRole("button", { name: "Save register" }).props
      .accessibilityState.disabled,
  ).toBe(true);

  fireEvent.press(late);

  expect(
    screen.getByLabelText("Jordan Smith: Late").props.accessibilityState
      .selected,
  ).toBe(true);
  expect(screen.getByText("Saved: Absent")).toBeTruthy();
  expect(screen.getByText("Pending: Late")).toBeTruthy();
  expect(screen.getByLabelText("0 saved late")).toBeTruthy();
  expect(
    screen.getByLabelText("Correction reason for Jordan Smith"),
  ).toBeTruthy();
});

it("requires a trimmed correction reason, preserves the failed batch, and retries the same DTO", async () => {
  const save = jest
    .spyOn(attendanceApi, "saveAttendanceSession")
    .mockRejectedValueOnce(new Error("Connection interrupted."))
    .mockResolvedValueOnce(correctedDetail);
  const screen = render(<AttendanceScreen />);
  await waitFor(() => expect(screen.getByText("Jordan Smith")).toBeTruthy());

  fireEvent.press(screen.getByLabelText("Jordan Smith: Late"));
  fireEvent.press(screen.getByText("Save register"));
  expect(screen.getByText("Enter a correction reason.")).toBeTruthy();
  expect(save).not.toHaveBeenCalled();

  fireEvent.changeText(
    screen.getByLabelText("Correction reason for Jordan Smith"),
    "  Arrived after the register closed  ",
  );
  fireEvent.press(screen.getByText("Save register"));
  await waitFor(() =>
    expect(screen.getByText(/No attendance changes were saved/)).toBeTruthy(),
  );
  expect(screen.getByText("Pending: Late")).toBeTruthy();
  expect(save).toHaveBeenCalledWith("session/1", [
    {
      childId: "child-1",
      status: "LATE",
      correctionReason: "Arrived after the register closed",
    },
  ]);

  fireEvent.press(screen.getByText("Retry save"));
  await waitFor(() => expect(screen.getByText("Saved: Late")).toBeTruthy());
  expect(save).toHaveBeenCalledTimes(2);
  expect(save.mock.calls[1]).toEqual(save.mock.calls[0]);
  expect(screen.queryByText("Pending: Late")).toBeNull();
  expect(screen.getByLabelText("1 saved late")).toBeTruthy();
});

it("marks an unrecorded child without requesting a correction reason", async () => {
  const unmarked = {
    ...initialDetail,
    rows: [],
    childStatusRows: [
      {
        attendanceId: null,
        childId: "child-1",
        childName: "Jordan Smith",
        status: "unknown" as const,
      },
    ],
    summary: { present: 0, absent: 0, late: 0, unknown: 1 },
    progressStatus: "not_started" as const,
  };
  jest
    .spyOn(attendanceApi, "fetchAttendanceSessionDetail")
    .mockResolvedValue(unmarked);
  const save = jest
    .spyOn(attendanceApi, "saveAttendanceSession")
    .mockResolvedValue({
      ...unmarked,
      childStatusRows: [
        {
          attendanceId: "attendance-1",
          childId: "child-1",
          childName: "Jordan Smith",
          status: "present",
        },
      ],
      summary: { present: 1, absent: 0, late: 0, unknown: 0 },
      progressStatus: "completed",
    });
  const screen = render(<AttendanceScreen />);
  await waitFor(() => expect(screen.getByText("Jordan Smith")).toBeTruthy());

  fireEvent.press(screen.getByLabelText("Jordan Smith: Present"));
  expect(
    screen.queryByLabelText("Correction reason for Jordan Smith"),
  ).toBeNull();
  fireEvent.press(screen.getByText("Save register"));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save).toHaveBeenCalledWith("session/1", [
    { childId: "child-1", status: "PRESENT" },
  ]);
});
