export const VERCEL_PATH_QUERY_PARAM = "__vercel_path";

export function normalizeVercelRequestUrl(url: string | undefined): string {
  if (!url) return "/";
  const routedUrl = normalizeRouteDestUrl(url);
  if (routedUrl) return routedUrl;
  if (url === "/api") return "/";
  if (url.startsWith("/api/")) return url.slice("/api".length);
  return url;
}

function normalizeRouteDestUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url, "https://api.localhost");
  } catch {
    return null;
  }

  const routedPath = parsed.searchParams.get(VERCEL_PATH_QUERY_PARAM);
  if (routedPath === null) return null;

  parsed.searchParams.delete(VERCEL_PATH_QUERY_PARAM);

  const path = routedPath.replace(/^\/+/, "");
  const pathname = path ? `/${path}` : "/";
  const query = parsed.searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function stripVercelRoutingQueryParam(query: unknown): void {
  if (!isRecord(query)) return;
  delete query[VERCEL_PATH_QUERY_PARAM];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
