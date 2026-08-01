/**
 * Minimal static file server for the `expo export -p web` output, with an
 * SPA fallback so a direct navigation to a nested expo-router path (e.g.
 * /(home)/(tabs)/week) serves index.html and lets client-side routing
 * take over - a plain static server would 404 on any path but the ones
 * that happen to have a matching file on disk. Node's built-in http/fs is
 * enough for this; no new dependency needed for what is a handful of
 * static files.
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";

const distDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "dist",
);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ttf": "font/ttf",
  ".svg": "image/svg+xml",
};

async function resolveFile(requestPath) {
  const candidate = path.join(distDir, decodeURIComponent(requestPath));
  try {
    const stats = await stat(candidate);
    if (stats.isFile()) return candidate;
  } catch {
    // fall through to SPA fallback
  }
  return null;
}

export function startServer(port) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const filePath = (await resolveFile(url.pathname)) ?? path.join(distDir, "index.html");
    try {
      const body = await readFile(filePath);
      res.writeHead(200, { "Content-Type": MIME_TYPES[path.extname(filePath)] ?? "application/octet-stream" });
      res.end(body);
    } catch (error) {
      res.writeHead(500);
      res.end(String(error));
    }
  });

  return new Promise((resolve) => {
    server.listen(port, () => resolve(server));
  });
}
