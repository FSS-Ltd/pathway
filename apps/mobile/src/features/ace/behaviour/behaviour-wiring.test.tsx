import * as SecureStore from "expo-secure-store";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { apiClient } from "@/lib/api/client";
import * as behaviourApi from "@/lib/api/behaviour";
import { BehaviourScreen } from "./behaviour-screen";

jest.mock("@/components/primitives/brand-logo", () => ({
  BrandLogo: () => null,
}));

jest.mock("@/hooks/use-app-ready", () => ({
  useAppReady: () => mockAppReady(),
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
      activeSiteState: { activeSiteId: "site-1", sites: [] },
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
      expect(screen.getByText("Behaviour recorded.")).toBeTruthy(),
    );
    expect(record).toHaveBeenCalledTimes(2);
    expect(record.mock.calls[0]?.[0].idempotencyKey).toBe(
      record.mock.calls[1]?.[0].idempotencyKey,
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
    rejectLoad?.(new Error("offline"));
    await waitFor(() => expect(screen.getByText("Try again")).toBeTruthy());

    jest.spyOn(behaviourApi, "fetchBehaviourHistory").mockResolvedValueOnce({
      items: [],
    });
    fireEvent.press(screen.getByText("Try again"));
    await waitFor(() =>
      expect(screen.getByText("No behaviour records yet.")).toBeTruthy(),
    );
  });
});
