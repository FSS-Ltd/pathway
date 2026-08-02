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

function networkErrorSuggestion(url: string): string {
  if (url.includes("://api.localhost")) {
    return ' Local dev hint: if TLS cert trust fails, use "http://localhost:3003" for EXPO_PUBLIC_API_URL or run API over trusted HTTPS.';
  }
  if (url.includes("://api.127.0.0.1")) {
    return ' Local dev hint: set EXPO_PUBLIC_API_URL to "https://api.localhost:3003".';
  }
  return "";
}

/**
 * Thin fetch wrapper, ported from apps/mobile/src/lib/api/client.ts. Kept
 * as a single low-level `request()` plus per-domain modules (auth.ts,
 * platform.ts, ...) from the start, rather than one growing class - that
 * file's own TODO(api-domains) comment asked for exactly this split.
 */
class HomeApiClient {
  private accessToken: string | null = null;

  setAccessToken(token: string | null) {
    this.accessToken = token;
  }

  getAccessToken() {
    return this.accessToken;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const response = await this.fetchChecked(path, options);
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  /** Like request(), but for non-JSON responses (e.g. a downloaded CSV report). */
  async requestText(path: string, options: RequestOptions = {}): Promise<string> {
    const response = await this.fetchChecked(path, options);
    return response.text();
  }

  private async fetchChecked(path: string, options: RequestOptions): Promise<Response> {
    const { token, headers, ...rest } = options;
    const bearerToken = token ?? this.accessToken;
    const url = `${env.apiUrl}${path}`;
    let response: Response;
    try {
      response = await this.fetchWithDevFallback(url, {
        ...rest,
        headers: {
          Accept: "application/json",
          ...(rest.body ? { "Content-Type": "application/json" } : {}),
          ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
          ...headers,
        },
      });
    } catch (error) {
      const reason =
        error instanceof Error && error.message ? error.message : "Unknown network error";
      throw new Error(
        `Network request failed for ${url}: ${reason}${networkErrorSuggestion(url)}`,
      );
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new ApiError(
        `API request failed (${response.status}) for ${path}`,
        response.status,
        body,
      );
    }

    return response;
  }

  private async fetchWithDevFallback(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (firstError) {
      if (!__DEV__) throw firstError;

      const fallbackUrls = this.buildDevFallbackUrls(url);
      let lastNonProtocolMismatchResponse: Response | null = null;
      for (const fallbackUrl of fallbackUrls) {
        try {
          const response = await fetch(fallbackUrl, init);
          if (response.ok) return response;

          if (await this.isLikelyProtocolMismatchResponse(response, fallbackUrl)) {
            continue;
          }

          lastNonProtocolMismatchResponse = response;
        } catch {
          // Try next candidate.
        }
      }

      if (lastNonProtocolMismatchResponse) {
        return lastNonProtocolMismatchResponse;
      }

      throw firstError;
    }
  }

  private async isLikelyProtocolMismatchResponse(
    response: Response,
    requestUrl: string,
  ): Promise<boolean> {
    if (!requestUrl.startsWith("http://")) return false;
    if (response.status !== 400 && response.status !== 426) return false;

    const body = await response
      .clone()
      .text()
      .catch(() => "");

    if (!body) return true;

    const normalized = body.toLowerCase();
    return (
      normalized.includes("plain http request was sent to https port") ||
      normalized.includes("client sent an http request to an https server") ||
      (normalized.includes("https") && normalized.includes("http"))
    );
  }

  private buildDevFallbackUrls(url: string): string[] {
    const candidates = new Set<string>();
    const withPortVariants = (inputUrl: string) => {
      candidates.add(inputUrl);
      if (inputUrl.includes(":3003")) {
        candidates.add(inputUrl.replace(":3003", ":3000"));
        candidates.add(inputUrl.replace(":3003", ":3001"));
      }
    };

    if (url.includes("://api.127.0.0.1")) {
      withPortVariants(url.replace("://api.127.0.0.1", "://api.localhost"));
      withPortVariants(url.replace("://api.127.0.0.1", "://localhost"));
      withPortVariants(url.replace("://api.127.0.0.1", "://127.0.0.1"));
    }

    if (url.includes("://api.localhost")) {
      withPortVariants(url.replace("://api.localhost", "://localhost"));
      withPortVariants(url.replace("://api.localhost", "://127.0.0.1"));
    }

    if (url.startsWith("https://")) {
      const httpUrl = `http://${url.slice("https://".length)}`;
      withPortVariants(httpUrl);

      if (httpUrl.includes("://api.localhost")) {
        withPortVariants(httpUrl.replace("://api.localhost", "://localhost"));
        withPortVariants(httpUrl.replace("://api.localhost", "://127.0.0.1"));
      }
      if (httpUrl.includes("://api.127.0.0.1")) {
        withPortVariants(httpUrl.replace("://api.127.0.0.1", "://localhost"));
        withPortVariants(httpUrl.replace("://api.127.0.0.1", "://127.0.0.1"));
      }
    }

    candidates.delete(url);
    return Array.from(candidates);
  }
}

export const apiClient = new HomeApiClient();
