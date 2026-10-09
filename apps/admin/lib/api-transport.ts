export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly requestId: string | null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type TokenGetter = () => Promise<string | null>;
const TOKEN_WAIT_MS = 15_000;

let tokenGetter: TokenGetter | null = null;
let pendingToken: Promise<string | null> | null = null;
let tokenGeneration = 0;
let readController = new AbortController();

export function cancelApiReads(): void {
  readController.abort();
  readController = new AbortController();
}

export function setApiTokenGetter(getter: TokenGetter | null): void {
  tokenGetter = getter;
  pendingToken = null;
  tokenGeneration += 1;
}

async function getCurrentToken(signal?: AbortSignal): Promise<string | null> {
  if (!tokenGetter) return null;
  if (!pendingToken) {
    const request = tokenGetter();
    pendingToken = request;
    void request
      .finally(() => {
        if (pendingToken === request) pendingToken = null;
      })
      .catch(() => undefined);
  }
  const request = pendingToken;
  const deadline = AbortSignal.timeout(TOKEN_WAIT_MS);
  const waitSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  return new Promise<string | null>((resolve, reject) => {
    const onAbort = () => {
      if (pendingToken === request) pendingToken = null;
      reject(waitSignal.reason);
    };
    if (waitSignal.aborted) {
      onAbort();
      return;
    }
    waitSignal.addEventListener("abort", onAbort, { once: true });
    void request.then(
      (token) => {
        waitSignal.removeEventListener("abort", onAbort);
        resolve(token);
      },
      (error: unknown) => {
        waitSignal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

export async function apiErrorFromResponse(
  response: Response,
  message: string,
): Promise<ApiError> {
  let code = "API_REQUEST_FAILED";
  try {
    const body: unknown = await response.clone().json();
    if (
      body &&
      typeof body === "object" &&
      "code" in body &&
      typeof body.code === "string" &&
      /^[A-Z][A-Z0-9_]{0,63}$/.test(body.code)
    ) {
      code = body.code;
    }
  } catch {
    // Error bodies are optional and never shown to users.
  }
  return new ApiError(
    message,
    response.status,
    code,
    response.headers.get("x-request-id"),
  );
}

/** Applies a current token only to this API, never to a third-party URL. */
export function createApiFetch(apiBaseUrl: string): typeof globalThis.fetch {
  const base = new URL(apiBaseUrl);
  const basePath = base.pathname.replace(/\/$/, "");
  return async (input, init) => {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      base,
    );
    if (
      url.origin !== base.origin ||
      (basePath &&
        url.pathname !== basePath &&
        !url.pathname.startsWith(`${basePath}/`))
    ) {
      return globalThis.fetch(input, init);
    }

    const generation = tokenGeneration;
    const currentReads = readController;
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    const send = async (): Promise<Response> => {
      const signal =
        method === "GET"
          ? init?.signal
            ? AbortSignal.any([init.signal, currentReads.signal])
            : currentReads.signal
          : (init?.signal ?? undefined);
      const token = await getCurrentToken(signal);
      if (generation !== tokenGeneration) {
        throw new ApiError(
          "Your session changed. Please retry.",
          401,
          "SESSION_CHANGED",
          null,
        );
      }
      const headers = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined),
      );
      if (tokenGetter) {
        if (!token) {
          throw new ApiError(
            "Your session is unavailable. Please retry.",
            401,
            "TOKEN_UNAVAILABLE",
            null,
          );
        }
        headers.set("Authorization", `Bearer ${token}`);
      }
      return globalThis.fetch(input, { ...init, headers, signal });
    };

    let response = await send();
    if (response.status === 401 && method === "GET" && tokenGetter) {
      response = await send();
    }
    if (generation !== tokenGeneration) {
      throw new ApiError(
        "Your session changed. Please retry.",
        401,
        "SESSION_CHANGED",
        null,
      );
    }
    return response;
  };
}
