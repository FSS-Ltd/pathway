import * as SecureStore from "expo-secure-store";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { apiClient } from "@/lib/api/client";
import * as behaviourApi from "@/lib/api/behaviour";
import { BehaviourScreen } from "./behaviour-screen";

jest.mock("@/components/primitives/brand-logo", () => ({
  BrandLogo: () => null,
}));

jest.mock("@/hooks/use-app-ready", () => ({
  useAppReady: () => mockAppReady(),
}));

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ fontScale: 2, height: 640, scale: 2, width: 320 }),
}));

const mockAppReady = jest.fn();

const policy: behaviourApi.BehaviourPolicyResponse = {
  categoryVersion: 2,
  categories: [
    {
      code: "kindness",
      label: "Kindness",
      type: "MERIT",
      visibility: "GENERAL",
      isActive: true,
      isSerious: false,
      sortOrder: 1,
    },
    {
      code: "conduct",
      label: "Conduct",
      type: "DEMERIT",
      visibility: "GENERAL",
      isActive: true,
      isSerious: false,
      sortOrder: 2,
    },
    {
      code: "pastoral",
      label: "Pastoral care",
      type: "GENERAL",
      visibility: "SENSITIVE",
      isActive: true,
      isSerious: false,
      sortOrder: 3,
    },
  ],
  demeritPolicy: null,
};

const historyEntry: behaviourApi.BehaviourEntry = {
  id: "entry-1",
  childId: "child-1",
  category: "kindness",
  categoryPolicyVersion: 2,
  categoryIsSerious: false,
  type: "MERIT",
  visibility: "GENERAL",
  pointsDelta: 2,
  occurredAt: "2026-08-12T09:30:00.000Z",
  recordedByUserId: "user-1",
  reason: "Helped another learner",
  note: null,
  correctsBehaviourEntryId: null,
  createdAt: "2026-08-12T09:31:00.000Z",
};

function appReady(
  permissions = ["ace.behaviour.read", "ace.behaviour.record"],
) {
  return {
    isReady: true,
    bootstrapState: {
      status: "ready" as const,
      route: "/(auth)/site-select" as const,
      state: {
        userId: "user-1",
        activeSiteId: "site-1",
        updatedAt: "2026-08-12T09:00:00.000Z",
      },
      permissions,
      roles: {},
      activeSiteState: {
        activeSiteId: "site-1",
        sites: [
          {
            id: "site-1",
            name: "Los Angeles Campus",
            orgId: "org-1",
            orgName: "Pathway School",
            timezone: "America/Los_Angeles",
          },
        ],
      },
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

function sensitiveDraft() {
  return JSON.stringify({
    childId: "child-1",
    category: "pastoral",
    pointsDelta: "0",
    occurredAt: "2026-08-12T09:30:00.000Z",
    reason: "Private pastoral follow-up",
    note: "Restricted detail",
    idempotencyKey: "command-sensitive",
  });
}

beforeEach(() => {
  mockAppReady.mockReturnValue(appReady());
  jest.spyOn(behaviourApi, "fetchBehaviourPermissions").mockResolvedValue({
    orgId: "org-1",
    tenantId: "site-1",
    permissions: ["ace.behaviour.read", "ace.behaviour.record"],
  });
  jest
    .spyOn(behaviourApi, "fetchBehaviourChildren")
    .mockResolvedValue([{ id: "child-1", displayName: "Jordan Smith" }]);
  jest.spyOn(behaviourApi, "fetchBehaviourPolicy").mockResolvedValue(policy);
  jest.spyOn(behaviourApi, "fetchBehaviourHistory").mockResolvedValue({
    items: [historyEntry],
  });
  jest.spyOn(SecureStore, "getItemAsync").mockResolvedValue(null);
  jest.spyOn(SecureStore, "setItemAsync").mockResolvedValue();
  jest.spyOn(SecureStore, "deleteItemAsync").mockResolvedValue();
});

afterEach(() => {
  jest.restoreAllMocks();
  mockAppReady.mockReset();
});

describe("behaviour API contracts", () => {
  it("uses the exact policy, history, command, and correction routes", async () => {
    jest.restoreAllMocks();
    const request = jest.spyOn(apiClient, "request").mockResolvedValue({});
    const input: behaviourApi.BehaviourCommandInput = {
      idempotencyKey: "command-1",
      childId: "child-1",
      category: "kindness",
      type: "MERIT",
      visibility: "GENERAL",
      pointsDelta: 2,
      occurredAt: "2026-08-12T09:30:00.000Z",
      reason: "Helped another learner",
    };

    await behaviourApi.fetchBehaviourPolicy();
    await behaviourApi.fetchBehaviourHistory({ childId: "child-1", limit: 25 });
    await behaviourApi.recordBehaviour(input);
    await behaviourApi.correctBehaviour("entry/1", input);

    expect(request.mock.calls).toEqual([
      ["/ace/behaviour/policy", { method: "GET" }],
      ["/ace/behaviour?childId=child-1&limit=25", { method: "GET" }],
      ["/ace/behaviour", { method: "POST", body: JSON.stringify(input) }],
      [
        "/ace/behaviour/entry%2F1/corrections",
        { method: "POST", body: JSON.stringify(input) },
      ],
    ]);
  });
});

describe("BehaviourScreen", () => {
  it("discards a cached sensitive selection and never reveals sensitive mode without fresh permission", async () => {
    jest.spyOn(SecureStore, "getItemAsync").mockResolvedValue(sensitiveDraft());
    jest.spyOn(behaviourApi, "fetchBehaviourPolicy").mockResolvedValue({
      ...policy,
      categories: policy.categories.filter(
        (category) => category.visibility === "GENERAL",
      ),
    });
    const screen = render(<BehaviourScreen />);

    await waitFor(() => expect(screen.getByText("Kindness")).toBeTruthy());
    expect(screen.queryByText("Pastoral care")).toBeNull();
    expect(screen.queryByText("Sensitive records")).toBeNull();
    expect(screen.getByLabelText("Behaviour reason").props.value).toBe("");
    expect(screen.getByLabelText("Behaviour note").props.value).toBe("");
    await waitFor(() =>
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        "ace-behaviour-draft-v1:user-1:site-1",
        expect.not.stringContaining("pastoral"),
      ),
    );
  });

  it("shows an explicit warning only after fresh sensitive authorisation", async () => {
    jest.spyOn(behaviourApi, "fetchBehaviourPermissions").mockResolvedValue({
      orgId: "org-1",
      tenantId: "site-1",
      permissions: [
        "ace.behaviour.read",
        "ace.behaviour.record",
        "ace.behaviour.sensitive.read",
      ],
    });
    const screen = render(<BehaviourScreen />);

    await waitFor(() =>
      expect(screen.getByText("Sensitive records")).toBeTruthy(),
    );
    fireEvent.press(screen.getByText("Sensitive records"));
    expect(screen.getByText("Pastoral care")).toBeTruthy();
    expect(screen.getByText(/restricted behaviour record/i)).toBeTruthy();
  });

  it("preserves a scoped draft after an error and retries with the same command key", async () => {
    const record = jest
      .spyOn(behaviourApi, "recordBehaviour")
      .mockRejectedValueOnce(new Error("Connection interrupted. Try again."))
      .mockRejectedValueOnce(new Error("Connection interrupted. Try again."))
      .mockResolvedValueOnce({ entry: historyEntry, duplicate: false });
    const screen = render(<BehaviourScreen />);

    await waitFor(() => expect(screen.getByText("Jordan Smith")).toBeTruthy());
    fireEvent.press(screen.getByText("Jordan Smith"));
    fireEvent.press(screen.getByText("Kindness"));
    fireEvent.changeText(screen.getByLabelText("Behaviour points"), "2");
    fireEvent.changeText(
      screen.getByLabelText("Behaviour reason"),
      "Helped another learner",
    );
    fireEvent.press(screen.getByText("Record behaviour"));

    await waitFor(() =>
      expect(
        screen.getByText("Connection interrupted. Try again."),
      ).toBeTruthy(),
    );
    expect(screen.getByLabelText("Behaviour reason").props.value).toBe(
      "Helped another learner",
    );
    fireEvent.press(screen.getByText("Record behaviour"));
    await waitFor(() =>
      expect(
        screen.getByText("Connection interrupted. Try again."),
      ).toBeTruthy(),
    );
    expect(record).toHaveBeenCalledTimes(2);
    expect(record.mock.calls[0]?.[0].idempotencyKey).toBe(
      record.mock.calls[1]?.[0].idempotencyKey,
    );
    fireEvent.changeText(
      screen.getByLabelText("Behaviour reason"),
      "Helped two learners",
    );
    fireEvent.press(screen.getByText("Record behaviour"));
    await waitFor(() =>
      expect(screen.getByText("Behaviour recorded.")).toBeTruthy(),
    );
    expect(record).toHaveBeenCalledTimes(3);
    expect(record.mock.calls[1]?.[0].idempotencyKey).not.toBe(
      record.mock.calls[2]?.[0].idempotencyKey,
    );
    expect(record.mock.calls[2]?.[0].reason).toBe("Helped two learners");
    await waitFor(() =>
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        "ace-behaviour-draft-v1:user-1:site-1",
        expect.stringContaining(
          record.mock.calls[2]?.[0].idempotencyKey ?? "missing-key",
        ),
      ),
    );
  });

  it("renders loading, error retry, and empty states", async () => {
    let rejectLoad: ((reason: Error) => void) | undefined;
    jest.spyOn(behaviourApi, "fetchBehaviourPolicy").mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectLoad = reject;
        }),
    );
    const screen = render(<BehaviourScreen />);
    expect(screen.getByText("Loading behaviour capture…")).toBeTruthy();
    await waitFor(() =>
      expect(behaviourApi.fetchBehaviourPolicy).toHaveBeenCalled(),
    );
    rejectLoad?.(new Error("offline"));
    await waitFor(() => expect(screen.getByText("Try again")).toBeTruthy());
    expect(screen.queryByText("Loading behaviour capture…")).toBeNull();

    jest.spyOn(behaviourApi, "fetchBehaviourHistory").mockResolvedValueOnce({
      items: [],
    });
    fireEvent.press(screen.getByText("Try again"));
    await waitFor(() =>
      expect(screen.getByText("No behaviour records yet.")).toBeTruthy(),
    );
  });

  it("fails closed before loading tenant data or drafts when fresh permission scope mismatches", async () => {
    jest.spyOn(behaviourApi, "fetchBehaviourPermissions").mockResolvedValue({
      orgId: "org-1",
      tenantId: "site-2",
      permissions: [
        "ace.behaviour.read",
        "ace.behaviour.record",
        "ace.behaviour.sensitive.read",
      ],
    });
    const screen = render(<BehaviourScreen />);

    await waitFor(() => expect(screen.getByText("Try again")).toBeTruthy());
    expect(screen.queryByText("Loading behaviour capture…")).toBeNull();
    expect(screen.queryByText("Jordan Smith")).toBeNull();
    expect(screen.queryByText("Sensitive records")).toBeNull();
    expect(behaviourApi.fetchBehaviourChildren).not.toHaveBeenCalled();
    expect(behaviourApi.fetchBehaviourPolicy).not.toHaveBeenCalled();
    expect(behaviourApi.fetchBehaviourHistory).not.toHaveBeenCalled();
    expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it("submits the observation time at press instead of an old invisible cached timestamp", async () => {
    jest.spyOn(SecureStore, "getItemAsync").mockResolvedValue(
      JSON.stringify({
        childId: "child-1",
        category: "kindness",
        pointsDelta: "2",
        occurredAt: "2000-01-01T00:00:00.000Z",
        reason: "Cached draft",
        note: "",
        idempotencyKey: "cached-command",
      }),
    );
    const record = jest
      .spyOn(behaviourApi, "recordBehaviour")
      .mockResolvedValue({ entry: historyEntry, duplicate: false });
    const beforePress = Date.now();
    const screen = render(<BehaviourScreen />);

    await waitFor(() =>
      expect(screen.getByText("Record behaviour")).toBeTruthy(),
    );
    fireEvent.press(screen.getByText("Record behaviour"));
    await waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    const submittedAt = Date.parse(record.mock.calls[0]?.[0].occurredAt ?? "");
    expect(submittedAt).toBeGreaterThanOrEqual(beforePress);
    expect(submittedAt).toBeLessThanOrEqual(Date.now());
    expect(record.mock.calls[0]?.[0].occurredAt).not.toBe(
      "2000-01-01T00:00:00.000Z",
    );
  });

  it("filters categories and keeps behaviour actions readable at 320pt and 200 percent text", async () => {
    const screen = render(<BehaviourScreen />);

    await waitFor(() => expect(screen.getByText("Kindness")).toBeTruthy());
    fireEvent.press(screen.getByText("Demerit categories"));
    expect(screen.queryByText("Kindness")).toBeNull();
    expect(screen.getByText("Conduct")).toBeTruthy();

    const recordLabel = screen.getByText("Record behaviour");
    expect(recordLabel.props.numberOfLines).toBeUndefined();
    expect(recordLabel.props.maxFontSizeMultiplier).toBeUndefined();
    expect(StyleSheet.flatten(recordLabel.props.style).flexShrink).toBe(1);

    fireEvent.press(screen.getByText("Correct record"));
    const correctionLabel = screen.getByText("Save correction");
    expect(correctionLabel.props.numberOfLines).toBeUndefined();
    expect(correctionLabel.props.maxFontSizeMultiplier).toBeUndefined();
    expect(StyleSheet.flatten(correctionLabel.props.style).flexShrink).toBe(1);
  });

  it("validates correction reason, reports failure, rotates edited retry, and announces success", async () => {
    const correct = jest
      .spyOn(behaviourApi, "correctBehaviour")
      .mockRejectedValueOnce(new Error("Correction temporarily unavailable."))
      .mockResolvedValueOnce({ entry: historyEntry, duplicate: false });
    const screen = render(<BehaviourScreen />);

    await waitFor(() =>
      expect(screen.getByText("Correct record")).toBeTruthy(),
    );
    fireEvent.press(screen.getByText("Correct record"));
    fireEvent.press(screen.getByText("Save correction"));
    expect(
      screen.getByText("Enter a reason for this correction."),
    ).toBeTruthy();

    fireEvent.changeText(
      screen.getByLabelText("Correction reason"),
      "Correct the context",
    );
    fireEvent.press(screen.getByText("Save correction"));
    await waitFor(() =>
      expect(
        screen.getByText("Correction temporarily unavailable."),
      ).toBeTruthy(),
    );
    fireEvent.changeText(
      screen.getByLabelText("Correction reason"),
      "Correct the context and outcome",
    );
    fireEvent.press(screen.getByText("Save correction"));
    await waitFor(() =>
      expect(screen.getByText("Correction recorded.")).toBeTruthy(),
    );
    expect(correct).toHaveBeenCalledTimes(2);
    expect(correct.mock.calls[0]?.[1].idempotencyKey).not.toBe(
      correct.mock.calls[1]?.[1].idempotencyKey,
    );
    expect(correct.mock.calls[1]?.[1].reason).toBe(
      "Correct the context and outcome",
    );
    expect(
      screen.UNSAFE_getByProps({ accessibilityLiveRegion: "polite" }),
    ).toBeTruthy();
  });

  it("renders history in the active site's IANA timezone", async () => {
    jest.spyOn(behaviourApi, "fetchBehaviourHistory").mockResolvedValue({
      items: [{ ...historyEntry, occurredAt: "2026-06-01T00:30:00.000Z" }],
    });
    const screen = render(<BehaviourScreen />);

    await waitFor(() =>
      expect(screen.getByText(/31 May 2026.*17:30/)).toBeTruthy(),
    );
  });
});
