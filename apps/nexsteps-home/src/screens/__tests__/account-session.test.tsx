import { Alert } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AppBootstrapContext } from "@/providers/app-providers";
import AccountSessionScreen from "../../../app/(home)/(tabs)/family/account-session";

// account-session.tsx calls useUser()/useSession()/isClerkAPIResponseError
// directly from @clerk/clerk-expo (no apps/api layer to mock instead - see
// account-session.ts's own header comment). Mocking the whole module (not
// jest.requireActual) avoids pulling in Clerk's native/Expo runtime
// (SecureStore etc.) that nothing else in this test suite currently loads.
// isClerkAPIResponseError is reimplemented with the same duck-typed check
// the real @clerk/shared guard uses (a `clerkError: true` marker), so a
// plain mock error object exercises the screen's real branch.
const mockUseUser = jest.fn();
const mockUseSession = jest.fn();

jest.mock("@clerk/clerk-expo", () => ({
  useUser: () => mockUseUser(),
  useSession: () => mockUseSession(),
  isClerkAPIResponseError: (err: unknown): boolean =>
    typeof err === "object" && err !== null && (err as { clerkError?: boolean }).clerkError === true,
}));

const bootstrapContextValue = {
  bootstrapState: {
    status: "ready" as const,
    route: "/(home)/(tabs)/week" as const,
    state: { userId: "u1", updatedAt: "2026-08-01T00:00:00.000Z" },
    activeSiteState: { activeSiteId: "site-1", sites: [] },
  },
  refreshBootstrap: jest.fn(),
  signOut: jest.fn(),
};

function makeSession(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    lastActiveAt: new Date("2026-08-01T00:00:00.000Z"),
    latestActivity: { browserName: "Safari", city: "Bristol", country: "UK", isMobile: false },
    revoke: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    totpEnabled: false,
    backupCodeEnabled: false,
    twoFactorEnabled: false,
    getSessions: jest.fn().mockResolvedValue([]),
    updatePassword: jest.fn(),
    ...overrides,
  };
}

function renderScreen(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <AppBootstrapContext.Provider value={bootstrapContextValue}>
        <AccountSessionScreen />
      </AppBootstrapContext.Provider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  jest.restoreAllMocks();
  mockUseUser.mockReset();
  mockUseSession.mockReset();
  bootstrapContextValue.signOut.mockClear();
});

describe("AccountSessionScreen", () => {
  it("shows a loading header while Clerk hasn't finished loading", () => {
    mockUseUser.mockReturnValue({ isLoaded: false, user: undefined });
    mockUseSession.mockReturnValue({ session: undefined });

    const { getByText } = renderScreen(new QueryClient());

    expect(getByText("Loading...")).toBeTruthy();
  });

  it("shows an error notice when the session list fails to load", async () => {
    const user = makeUser({ getSessions: jest.fn().mockRejectedValue(new Error("network down")) });
    mockUseUser.mockReturnValue({ isLoaded: true, user });
    mockUseSession.mockReturnValue({ session: { id: "sess_current" } });

    const { getByText } = renderScreen(new QueryClient({ defaultOptions: { queries: { retry: false } } }));

    await waitFor(() => expect(getByText("Could not load sessions")).toBeTruthy());
    expect(getByText("Something went wrong")).toBeTruthy();
  });

  it("renders the signed-in device list and real 2FA status on success", async () => {
    // Current session always renders as "This device" regardless of its
    // own browser/location - formatSessionLabel only applies to the other
    // (non-current) rows, so Safari/Bristol/UK belongs on otherSession here.
    const currentSession = makeSession("sess_current", {
      latestActivity: { browserName: "Chrome", isMobile: false },
    });
    const otherSession = makeSession("sess_other");
    const user = makeUser({ getSessions: jest.fn().mockResolvedValue([currentSession, otherSession]) });
    mockUseUser.mockReturnValue({ isLoaded: true, user });
    mockUseSession.mockReturnValue({ session: { id: "sess_current" } });

    const { getByText, queryByText } = renderScreen(new QueryClient());

    await waitFor(() => expect(getByText("This device")).toBeTruthy());
    expect(getByText("Safari · Bristol, UK")).toBeTruthy();
    expect(queryByText("Chrome")).toBeNull();
    expect(
      getByText(
        "Two-factor authentication isn't turned on for this account yet. Authenticator-app setup is coming soon to this screen.",
      ),
    ).toBeTruthy();
  });

  it("hides the sign-out-other-sessions action when the current device is the only session", async () => {
    const currentSession = makeSession("sess_current");
    const user = makeUser({ getSessions: jest.fn().mockResolvedValue([currentSession]) });
    mockUseUser.mockReturnValue({ isLoaded: true, user });
    mockUseSession.mockReturnValue({ session: { id: "sess_current" } });

    const { getByText, queryByLabelText } = renderScreen(new QueryClient());

    await waitFor(() => expect(getByText("No other devices are signed in.")).toBeTruthy());
    expect(queryByLabelText("Sign out other sessions, Sign out")).toBeNull();
  });

  it("confirms via Alert before signing out other sessions, then re-fetches and shows success", async () => {
    const currentSession = makeSession("sess_current");
    const otherSession = makeSession("sess_other");
    const getSessions = jest
      .fn()
      .mockResolvedValueOnce([currentSession, otherSession])
      .mockResolvedValueOnce([currentSession]);
    const user = makeUser({ getSessions });
    mockUseUser.mockReturnValue({ isLoaded: true, user });
    mockUseSession.mockReturnValue({ session: { id: "sess_current" } });
    jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
      const confirmButton = buttons?.find((button) => button.style === "destructive");
      confirmButton?.onPress?.();
    });

    const { getByLabelText, getByText, queryByText } = renderScreen(new QueryClient());

    await waitFor(() => expect(getByLabelText("Sign out other sessions, Sign out")).toBeTruthy());
    fireEvent.press(getByLabelText("Sign out other sessions, Sign out"));

    await waitFor(() => expect((otherSession.revoke as jest.Mock)).toHaveBeenCalledTimes(1));
    expect((currentSession.revoke as jest.Mock)).not.toHaveBeenCalled();
    await waitFor(() => expect(getByText("Other sessions signed out")).toBeTruthy());
    // The revoked device must stop appearing once the mutation settles, not
    // linger from the pre-revoke render (sub-plan 08f's unique state).
    await waitFor(() => expect(queryByText("No other devices are signed in.")).toBeTruthy());
  });

  it("does not revoke anything when the sign-out confirmation is cancelled", async () => {
    const currentSession = makeSession("sess_current");
    const otherSession = makeSession("sess_other");
    const user = makeUser({ getSessions: jest.fn().mockResolvedValue([currentSession, otherSession]) });
    mockUseUser.mockReturnValue({ isLoaded: true, user });
    mockUseSession.mockReturnValue({ session: { id: "sess_current" } });
    // Simulates the user pressing "Cancel" - no button's onPress fires.
    jest.spyOn(Alert, "alert").mockImplementation(() => undefined);

    const { getByLabelText } = renderScreen(new QueryClient());

    await waitFor(() => expect(getByLabelText("Sign out other sessions, Sign out")).toBeTruthy());
    fireEvent.press(getByLabelText("Sign out other sessions, Sign out"));

    expect((otherSession.revoke as jest.Mock)).not.toHaveBeenCalled();
  });

  it("calls AppBootstrapContext's signOut when signing out this device", async () => {
    const currentSession = makeSession("sess_current");
    const user = makeUser({ getSessions: jest.fn().mockResolvedValue([currentSession]) });
    mockUseUser.mockReturnValue({ isLoaded: true, user });
    mockUseSession.mockReturnValue({ session: { id: "sess_current" } });

    const { getByLabelText } = renderScreen(new QueryClient());

    await waitFor(() => expect(getByLabelText("Sign out this device, Sign out")).toBeTruthy());
    fireEvent.press(getByLabelText("Sign out this device, Sign out"));

    expect(bootstrapContextValue.signOut).toHaveBeenCalledTimes(1);
  });

  it("only calls updatePassword once current/new/confirm password all validate", async () => {
    const currentSession = makeSession("sess_current");
    const updatePassword = jest.fn().mockResolvedValue({});
    const user = makeUser({ getSessions: jest.fn().mockResolvedValue([currentSession]), updatePassword });
    mockUseUser.mockReturnValue({ isLoaded: true, user });
    mockUseSession.mockReturnValue({ session: { id: "sess_current" } });

    const { getByText, getByLabelText } = renderScreen(new QueryClient());

    await waitFor(() => expect(getByText("Change password")).toBeTruthy());

    fireEvent.press(getByText("Change password"));
    expect(updatePassword).not.toHaveBeenCalled();

    fireEvent.changeText(getByLabelText("Current password"), "old-pass");
    fireEvent.changeText(getByLabelText("New password"), "short");
    fireEvent.changeText(getByLabelText("Confirm new password"), "short");
    fireEvent.press(getByText("Change password"));
    expect(updatePassword).not.toHaveBeenCalled();

    fireEvent.changeText(getByLabelText("New password"), "new-password-123");
    fireEvent.changeText(getByLabelText("Confirm new password"), "does-not-match");
    fireEvent.press(getByText("Change password"));
    expect(updatePassword).not.toHaveBeenCalled();

    fireEvent.changeText(getByLabelText("Confirm new password"), "new-password-123");
    fireEvent.press(getByText("Change password"));

    await waitFor(() =>
      expect(updatePassword).toHaveBeenCalledWith({ currentPassword: "old-pass", newPassword: "new-password-123" }),
    );
    await waitFor(() => expect(getByText("Password updated")).toBeTruthy());
  });

  it("shows the Clerk API error's longMessage when the password change is rejected", async () => {
    const currentSession = makeSession("sess_current");
    const clerkError = {
      clerkError: true,
      errors: [{ message: "wrong password", longMessage: "That current password is incorrect." }],
    };
    const updatePassword = jest.fn().mockRejectedValue(clerkError);
    const user = makeUser({ getSessions: jest.fn().mockResolvedValue([currentSession]), updatePassword });
    mockUseUser.mockReturnValue({ isLoaded: true, user });
    mockUseSession.mockReturnValue({ session: { id: "sess_current" } });

    const { getByText, getByLabelText } = renderScreen(new QueryClient());

    await waitFor(() => expect(getByText("Change password")).toBeTruthy());
    fireEvent.changeText(getByLabelText("Current password"), "wrong-pass");
    fireEvent.changeText(getByLabelText("New password"), "new-password-123");
    fireEvent.changeText(getByLabelText("Confirm new password"), "new-password-123");
    fireEvent.press(getByText("Change password"));

    await waitFor(() => expect(getByText("That current password is incorrect.")).toBeTruthy());
  });

  it("falls back to a generic message for a non-Clerk password-change error", async () => {
    const currentSession = makeSession("sess_current");
    const updatePassword = jest.fn().mockRejectedValue(new Error("boom"));
    const user = makeUser({ getSessions: jest.fn().mockResolvedValue([currentSession]), updatePassword });
    mockUseUser.mockReturnValue({ isLoaded: true, user });
    mockUseSession.mockReturnValue({ session: { id: "sess_current" } });

    const { getByText, getByLabelText } = renderScreen(new QueryClient());

    await waitFor(() => expect(getByText("Change password")).toBeTruthy());
    fireEvent.changeText(getByLabelText("Current password"), "old-pass");
    fireEvent.changeText(getByLabelText("New password"), "new-password-123");
    fireEvent.changeText(getByLabelText("Confirm new password"), "new-password-123");
    fireEvent.press(getByText("Change password"));

    await waitFor(() =>
      expect(getByText("Could not change your password. Check your details and try again.")).toBeTruthy(),
    );
  });
});
