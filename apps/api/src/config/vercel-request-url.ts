export function normalizeVercelRequestUrl(url: string | undefined): string {
  if (!url) return "/";
  if (url === "/api") return "/";
  if (url.startsWith("/api/")) return url.slice("/api".length);
  return url;
}
