import { act, render, waitFor } from "@testing-library/react-native";
import { useContext } from "react";
import * as SecureStore from "expo-secure-store";

import { AppBootstrapContext, AppProviders } from "./app-providers";

const mockAuth = jest.fn();
const mockBootstrapAuthState = jest.fn();
const mockSetActiveSite = jest.fn();

jest.mock("@clerk/clerk-expo", () => ({
  useAuth: () => mockAuth(),
}));

jest.mock("@/config/env", () => ({
  assertEnv: jest.fn(),
}));

jest.mock("@/lib/api/client", () => ({
  apiClient: {
    setActiveSite: (...args: unknown[]) => mockSetActiveSite(...args),
  },
}));

jest.mock("@/lib/auth/bootstrap", () => ({
  bootstrapAuthState: (...args: unknown[]) => mockBootstrapAuthState(...args),
  startTokenRefresh: () => () => undefined,
}));

const readyState = {
  status: "ready" as const,
  route: "/(auth)/site-select" as const,
  state: {
    userId: "user-1",
    activeSiteId: "site-1",
    updatedAt: "2026-08-12T09:00:00.000Z",
  },
  roles: {},
  activeSiteState: { activeSiteId: "site-1", sites: [] },
  space: "serve" as const,
  availableSpaces: ["serve" as const],
  isDualSpaceUser: false,
  hasFamilyAccess: false,
  hasServeAccess: true,
};

let latestContext: React.ContextType<typeof AppBootstrapContext> = null;

function Probe() {
  latestContext = useContext(AppBootstrapContext);
  return null;
}

beforeEach(() => {
  latestContext = null;
  mockAuth.mockReturnValue({
    isLoaded: true,
    isSignedIn: true,
    getToken: jest.fn().mockResolvedValue("token-1"),
    signOut: jest.fn().mockResolvedValue(undefined),
  });
  mockBootstrapAuthState.mockResolvedValue(readyState);
  mockSetActiveSite.mockResolvedValue({ activeSiteId: "site-2", sites: [] });
  jest.spyOn(SecureStore, "deleteItemAsync").mockResolvedValue();
});

afterEach(() => {
  jest.restoreAllMocks();
  mockAuth.mockReset();
  mockBootstrapAuthState.mockReset();
  mockSetActiveSite.mockReset();
});

describe("AppProviders PACE draft cleanup", () => {
  it("clears the current user/site PACE draft before signing out", async () => {
    render(
      <AppProviders>
        <Probe />
      </AppProviders>,
    );

    await waitFor(() =>
      expect(latestContext?.bootstrapState.status).toBe("ready"),
    );
    await act(async () => {
      await latestContext?.signOut();
    });

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
      "ace-pace-draft-v1:user-1:site-1",
    );
    expect(mockAuth().signOut).toHaveBeenCalledTimes(1);
  });

  it("clears the prior site's PACE draft after changing active site", async () => {
    render(
      <AppProviders>
        <Probe />
      </AppProviders>,
    );

    await waitFor(() =>
      expect(latestContext?.bootstrapState.status).toBe("ready"),
    );
    await act(async () => {
      await latestContext?.switchActiveSite("site-2");
    });

    expect(mockSetActiveSite).toHaveBeenCalledWith("site-2", "token-1");
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
      "ace-pace-draft-v1:user-1:site-1",
    );
  });
});
