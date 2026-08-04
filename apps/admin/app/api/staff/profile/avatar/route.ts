import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import https from "node:https";
import http from "node:http";

const apiBaseUrl =
  process.env.ADMIN_INTERNAL_API_URL ??
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:3001";

// For local dev: Node's fetch rejects self-signed certs. Use an agent that skips TLS verification.
const isLocalhostHttps =
  apiBaseUrl.startsWith("https://") &&
  (apiBaseUrl.includes("localhost") || apiBaseUrl.includes("127.0.0.1"));
const insecureAgent =
  process.env.NODE_ENV !== "production" && isLocalhostHttps
    ? new https.Agent({ rejectUnauthorized: false })
    : undefined;

function fetchAvatar(
  url: URL,
  headers: Record<string, string>,
): Promise<{ statusCode: number; contentType: string; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const isHttps = url.protocol === "https:";
    const protocol = isHttps ? https : http;
    const req = protocol.request(
      url,
      {
        method: "GET",
        headers,
        ...(isHttps && insecureAgent ? { agent: insecureAgent } : {}),
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks);
          const contentType =
            res.headers["content-type"] ?? "image/jpeg";
          resolve({
            statusCode: res.statusCode ?? 500,
            contentType: String(contentType),
            body,
          });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

export async function GET(req: NextRequest) {
  const { getToken } = await auth();
  const accessToken = await getToken();
  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(`${apiBaseUrl.replace(/\/$/, "")}/staff/profile/avatar`);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
  };
  const cookie = req.headers.get("cookie");
  if (cookie) {
    headers.Cookie = cookie;
  }

  try {
    const { statusCode, contentType, body } = await fetchAvatar(url, headers);

    if (statusCode === 404) {
      return NextResponse.json({ error: "Avatar not found" }, { status: 404 });
    }
    if (statusCode >= 400) {
      return NextResponse.json(
        { error: "Failed to fetch avatar" },
        { status: statusCode },
      );
    }

    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    console.error("[Avatar] Fetch failed:", err);
    return NextResponse.json(
      { error: "Failed to fetch avatar" },
      { status: 502 },
    );
  }
}
