import type { ActiveSiteState, AuthMe, RolesResponse } from "@pathway/mobile-core";

import { env } from "@/config/env";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type RequestOptions = Omit<RequestInit, "headers"> & {
  token?: string;
  headers?: Record<string, string>;
};

class MobileApiClient {
  private accessToken: string | null = null;

  setAccessToken(token: string | null) {
    this.accessToken = token;
  }

  getAccessToken() {
    return this.accessToken;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { token, headers, ...rest } = options;
    const bearerToken = token ?? this.accessToken;
    const url = `${env.apiUrl}${path}`;
    const response = await fetch(url, {
      ...rest,
      headers: {
        Accept: "application/json",
        ...(rest.body ? { "Content-Type": "application/json" } : {}),
        ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
        ...headers,
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new ApiError(
        `API request failed (${response.status}) for ${path}`,
        response.status,
        body,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  getAuthMe(token?: string) {
    return this.request<AuthMe>("/auth/me", { method: "GET", token });
  }

  getActiveSiteState(token?: string) {
    return this.request<ActiveSiteState>("/auth/active-site", {
      method: "GET",
      token,
    });
  }

  getRoles(token?: string) {
    return this.request<RolesResponse>("/auth/active-site/roles", {
      method: "GET",
      token,
    });
  }

  setActiveSite(siteId: string, token?: string) {
    return this.request<ActiveSiteState>("/auth/active-site", {
      method: "POST",
      token,
      body: JSON.stringify({ siteId }),
    });
  }
}

export const apiClient = new MobileApiClient();

// TODO(api-domains): split into auth/attendance/sessions/family/reporting modules as features are added.
