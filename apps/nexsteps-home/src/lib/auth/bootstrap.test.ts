import { ApiError } from "@/lib/api";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    apiClient: { setAccessToken: jest.fn() },
    authApi: {
      getAuthMe: jest.fn(),
      getActiveSiteState: jest.fn(),
      setActiveSite: jest.fn(),
    },
  };
});

jest.mock("@/lib/auth/auth0-client", () => ({
  getValidSessionSnapshot: jest.fn(),
}));

jest.mock("@/lib/auth/session-store", () => ({
  clearSessionSnapshot: jest.fn(),
  updateSessionSnapshot: jest.fn(),
}));

import { apiClient, authApi } from "@/lib/api";
import { getValidSessionSnapshot } from "@/lib/auth/auth0-client";
import { clearSessionSnapshot, updateSessionSnapshot } from "@/lib/auth/session-store";
import { bootstrapAuthState } from "./bootstrap";

const session = {
  accessToken: "token",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

describe("bootstrapAuthState", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns unauthenticated when there is no stored session", async () => {
    (getValidSessionSnapshot as jest.Mock).mockResolvedValue(null);

    const state = await bootstrapAuthState();

    expect(state).toEqual({ status: "unauthenticated", route: "/(setup)/welcome" });
  });

  it("auto-selects the single site and routes to the Week tab when ready", async () => {
    (getValidSessionSnapshot as jest.Mock).mockResolvedValue(session);
    (authApi.getAuthMe as jest.Mock).mockResolvedValue({ userId: "user-1" });
    (authApi.getActiveSiteState as jest.Mock).mockResolvedValue({
      activeSiteId: null,
      sites: [{ id: "site-1", name: "Household", orgId: "org-1", orgName: "Household Org" }],
    });
    (authApi.setActiveSite as jest.Mock).mockResolvedValue({
      activeSiteId: "site-1",
      sites: [{ id: "site-1", name: "Household", orgId: "org-1", orgName: "Household Org" }],
    });
    (updateSessionSnapshot as jest.Mock).mockResolvedValue({ ...session, activeSiteId: "site-1" });

    const state = await bootstrapAuthState();

    expect(apiClient.setAccessToken).toHaveBeenCalledWith("token");
    expect(authApi.setActiveSite).toHaveBeenCalledWith("site-1", "token");
    expect(state.status).toBe("ready");
    if (state.status === "ready") {
      expect(state.route).toBe("/(home)/(tabs)/week");
      expect(state.activeSiteState.activeSiteId).toBe("site-1");
    }
  });

  it("clears the session and returns unauthenticated on a 401", async () => {
    (getValidSessionSnapshot as jest.Mock).mockResolvedValue(session);
    (authApi.getAuthMe as jest.Mock).mockRejectedValue(
      new ApiError("API request failed (401) for /auth/me", 401, ""),
    );

    const state = await bootstrapAuthState();

    expect(clearSessionSnapshot).toHaveBeenCalled();
    expect(state).toEqual({ status: "unauthenticated", route: "/(setup)/welcome" });
  });

  it("surfaces a non-auth failure as an error state with a message", async () => {
    (getValidSessionSnapshot as jest.Mock).mockResolvedValue(session);
    (authApi.getAuthMe as jest.Mock).mockRejectedValue(new Error("Network down"));

    const state = await bootstrapAuthState();

    expect(state).toEqual({
      status: "error",
      route: "/(setup)/welcome",
      message: "Network down",
    });
  });
});
