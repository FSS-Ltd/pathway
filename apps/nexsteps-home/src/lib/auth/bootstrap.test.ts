import { ApiError } from "@/lib/api";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    apiClient: { setAccessToken: jest.fn(), setOrgId: jest.fn() },
    authApi: {
      getAuthMe: jest.fn(),
      getActiveSiteState: jest.fn(),
      setActiveSite: jest.fn(),
    },
  };
});

jest.mock("@/lib/auth/session-store", () => ({
  clearAppStateSnapshot: jest.fn(),
  getAppStateSnapshot: jest.fn(),
  updateAppStateSnapshot: jest.fn(),
}));

import { apiClient, authApi } from "@/lib/api";
import {
  clearAppStateSnapshot,
  getAppStateSnapshot,
  updateAppStateSnapshot,
} from "@/lib/auth/session-store";
import { bootstrapAuthState, startTokenRefresh } from "./bootstrap";

const state = {
  updatedAt: "2026-08-01T00:00:00.000Z",
};

describe("bootstrapAuthState", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAppStateSnapshot as jest.Mock).mockResolvedValue(state);
  });

  it("returns unauthenticated when getToken resolves to null", async () => {
    const result = await bootstrapAuthState(async () => null);

    expect(result).toEqual({ status: "unauthenticated", route: "/(setup)/welcome" });
  });

  it("auto-selects the single site and routes to the Week tab when ready", async () => {
    (authApi.getAuthMe as jest.Mock).mockResolvedValue({ userId: "user-1" });
    (authApi.getActiveSiteState as jest.Mock).mockResolvedValue({
      activeSiteId: null,
      sites: [{ id: "site-1", name: "Household", orgId: "org-1", orgName: "Household Org" }],
    });
    (authApi.setActiveSite as jest.Mock).mockResolvedValue({
      activeSiteId: "site-1",
      sites: [{ id: "site-1", name: "Household", orgId: "org-1", orgName: "Household Org" }],
    });
    (updateAppStateSnapshot as jest.Mock).mockResolvedValue({ ...state, activeSiteId: "site-1" });

    const result = await bootstrapAuthState(async () => "token");

    expect(apiClient.setAccessToken).toHaveBeenCalledWith("token");
    expect(apiClient.setOrgId).toHaveBeenCalledWith("org-1");
    expect(authApi.setActiveSite).toHaveBeenCalledWith("site-1", "token");
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.route).toBe("/(home)/(tabs)/week");
      expect(result.activeSiteState.activeSiteId).toBe("site-1");
    }
  });

  it("clears app state and returns unauthenticated on a 401", async () => {
    (authApi.getAuthMe as jest.Mock).mockRejectedValue(
      new ApiError("API request failed (401) for /auth/me", 401, ""),
    );

    const result = await bootstrapAuthState(async () => "token");

    expect(clearAppStateSnapshot).toHaveBeenCalled();
    expect(result).toEqual({ status: "unauthenticated", route: "/(setup)/welcome" });
  });

  it("surfaces a non-auth failure as an error state with a message", async () => {
    (authApi.getAuthMe as jest.Mock).mockRejectedValue(new Error("Network down"));

    const result = await bootstrapAuthState(async () => "token");

    expect(result).toEqual({
      status: "error",
      route: "/(setup)/welcome",
      message: "Network down",
    });
  });
});

describe("startTokenRefresh", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("refreshes the api-client token on an interval well under Clerk's 60s token lifetime", async () => {
    const getToken = jest.fn().mockResolvedValue("fresh-token");

    const stop = startTokenRefresh(getToken);

    expect(apiClient.setAccessToken).not.toHaveBeenCalled();

    jest.advanceTimersByTime(30_000);
    await Promise.resolve();

    expect(getToken).toHaveBeenCalledTimes(1);
    expect(apiClient.setAccessToken).toHaveBeenCalledWith("fresh-token");

    stop();
    jest.advanceTimersByTime(60_000);
    expect(getToken).toHaveBeenCalledTimes(1);
  });
});
