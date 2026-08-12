import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import * as SecureStore from "expo-secure-store";

import * as paceApi from "@/lib/api/pace";
import { PaceScreen } from "./pace-screen";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn() },
}));

jest.mock("@/components/primitives/brand-logo", () => ({
  BrandLogo: () => null,
}));

jest.mock("@/hooks/use-app-ready", () => ({
  useAppReady: () => mockAppReady(),
}));

const mockAppReady = jest.fn();

const roster = {
  items: [
    {
      child: { id: "child-1", displayName: "Jordan Smith" },
      group: null,
      subject: { id: "subject-1", name: "Mathematics" },
      currentPace: 1001,
      targetPace: 1012,
      status: "ON_TRACK" as const,
      currentLevel: 10,
      rebuiltAt: null,
    },
  ],
  nextCursor: null,
};

function appReady(userId = "user-1", siteId = "site-1") {
  return {
    isReady: true,
    bootstrapState: {
      status: "ready" as const,
      route: "/(auth)/site-select" as const,
      state: {
        userId,
        activeSiteId: siteId,
        updatedAt: "2026-08-12T09:00:00.000Z",
      },
      roles: {},
      activeSiteState: { activeSiteId: siteId, sites: [] },
      space: "serve" as const,
      availableSpaces: ["serve" as const],
      isDualSpaceUser: false,
      hasFamilyAccess: false,
      hasServeAccess: true,
    },
    refreshBootstrap: jest.fn(),
    signOut: jest.fn(),
    switchSpace: jest.fn(),
    switchActiveSite: jest.fn(),
  };
}

function persistedDraft(reason = "Supervised PACE test") {
  return JSON.stringify({
    childId: "child-1",
    subjectId: "subject-1",
    paceNumber: "1001",
    assessmentType: "FinalTest",
    score: "76",
    assessedAt: "2026-08-12T09:30:00.000Z",
    reason,
    idempotencyKey: "command-1",
  });
}

beforeEach(() => {
  mockAppReady.mockReturnValue(appReady());
  jest.spyOn(paceApi, "fetchPaceRoster").mockResolvedValue(roster);
  jest.spyOn(SecureStore, "getItemAsync").mockResolvedValue(persistedDraft());
  jest.spyOn(SecureStore, "setItemAsync").mockResolvedValue();
  jest.spyOn(SecureStore, "deleteItemAsync").mockResolvedValue();
});

afterEach(() => {
  jest.restoreAllMocks();
  mockAppReady.mockReset();
});

describe("PaceScreen", () => {
  it("hydrates only the active user's active-site draft and sends its API DTO once", async () => {
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const record = jest
      .spyOn(paceApi, "recordPaceAssessment")
      .mockImplementation(async () => {
        await pending;
        return {
          assessment: {
            id: "assessment-1",
            childId: "child-1",
            subjectId: "subject-1",
            paceNumber: 1001,
            assessmentType: "FinalTest",
            score: 76,
            result: "passed",
            assessedOn: "2026-08-12",
          },
          progress: {
            currentPace: 1002,
            targetPace: 1012,
            completedPaces: 1,
            trackStatus: "ON_TRACK",
            blockCode: null,
            lastAssessmentId: "assessment-1",
            rebuiltAt: "2026-08-12T09:30:00.000Z",
          },
          duplicate: false,
        };
      });

    const screen = render(<PaceScreen />);

    await waitFor(() =>
      expect(SecureStore.getItemAsync).toHaveBeenCalledWith(
        "ace-pace-draft-v1:user-1:site-1",
      ),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Assessment reason").props.value).toBe(
        "Supervised PACE test",
      ),
    );
    await waitFor(() =>
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        "ace-pace-draft-v1:user-1:site-1",
        expect.any(String),
      ),
    );

    fireEvent.press(screen.getByText("Record assessment"));
    fireEvent.press(screen.getByText("Recording…"));

    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith({
      idempotencyKey: "command-1",
      childId: "child-1",
      subjectId: "subject-1",
      paceNumber: 1001,
      assessmentType: "FinalTest",
      score: 76,
      assessedAt: "2026-08-12T09:30:00.000Z",
      reason: "Supervised PACE test",
    });

    release?.();
    await waitFor(() =>
      expect(screen.getByText("Assessment recorded.")).toBeTruthy(),
    );
  });

  it("does not hydrate one account's draft into another account", async () => {
    const screen = render(<PaceScreen />);
    await waitFor(() => expect(screen.getByText("Jordan Smith")).toBeTruthy());

    mockAppReady.mockReturnValue(appReady("user-2", "site-1"));
    jest.spyOn(SecureStore, "getItemAsync").mockResolvedValueOnce(null);
    screen.rerender(<PaceScreen />);

    await waitFor(() =>
      expect(SecureStore.getItemAsync).toHaveBeenCalledWith(
        "ace-pace-draft-v1:user-2:site-1",
      ),
    );
    await waitFor(() =>
      expect(screen.queryByText("Record Mathematics assessment")).toBeNull(),
    );
  });

  it("retains an offline draft when staff return to a previously active site", async () => {
    const screen = render(<PaceScreen />);
    await waitFor(() =>
      expect(screen.getByLabelText("Assessment reason").props.value).toBe(
        "Supervised PACE test",
      ),
    );

    mockAppReady.mockReturnValue(appReady("user-1", "site-2"));
    jest.spyOn(SecureStore, "getItemAsync").mockResolvedValueOnce(null);
    screen.rerender(<PaceScreen />);
    await waitFor(() =>
      expect(SecureStore.getItemAsync).toHaveBeenCalledWith(
        "ace-pace-draft-v1:user-1:site-2",
      ),
    );
    await waitFor(() =>
      expect(screen.queryByLabelText("Assessment reason")).toBeNull(),
    );

    mockAppReady.mockReturnValue(appReady("user-1", "site-1"));
    screen.rerender(<PaceScreen />);
    await waitFor(() =>
      expect(screen.getByLabelText("Assessment reason").props.value).toBe(
        "Supervised PACE test",
      ),
    );
  });

  it("renders large flexible controls for a 320pt/200% layout and shows a server policy block", async () => {
    jest
      .spyOn(paceApi, "recordPaceAssessment")
      .mockRejectedValue(
        new paceApi.PaceApiError(
          "Blocked by server policy",
          409,
          "daily-limit",
        ),
      );
    const screen = render(<PaceScreen />);

    await waitFor(() =>
      expect(screen.getByText("Record assessment")).toBeTruthy(),
    );
    fireEvent.press(screen.getByText("Record assessment"));

    await waitFor(() =>
      expect(
        screen.getByText(
          "This learner has reached the site’s daily assessment limit.",
        ),
      ).toBeTruthy(),
    );

    const touchTargets = screen.UNSAFE_root.findAll((node) => {
      const style =
        (StyleSheet.flatten(node.props.style as never) as
          | Record<string, unknown>
          | undefined) ?? {};
      return typeof style.minHeight === "number" && style.minHeight >= 52;
    });
    expect(touchTargets.length).toBeGreaterThanOrEqual(5);

    const flexibleControls = screen.UNSAFE_root.findAll((node) => {
      const style =
        (StyleSheet.flatten(node.props.style as never) as
          | Record<string, unknown>
          | undefined) ?? {};
      return style.flexGrow === 1 && style.minHeight === 52;
    });
    expect(flexibleControls.length).toBeGreaterThanOrEqual(3);
  });
});
