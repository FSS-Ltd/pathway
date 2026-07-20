import http from "node:http";
import https from "node:https";

export type RedeemedDownloadToken = {
  orgName: string | null;
  name: string | null;
};

const apiBaseUrl =
  process.env.API_INTERNAL_URL ??
  (process.env.NEXT_PUBLIC_API_URL?.startsWith("https://")
    ? `https://localhost:${process.env.API_PORT ?? "3003"}`
    : process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3003");

const insecureAgent =
  process.env.NODE_ENV !== "production"
    ? new https.Agent({ rejectUnauthorized: false })
    : undefined;

export async function redeemDownloadToken(token: string): Promise<{
  ok: boolean;
  status: number;
  data: RedeemedDownloadToken;
}> {
  const url = new URL(`${apiBaseUrl}/leads/toolkit/redeem-token`);
  const body = JSON.stringify({ token });
  const isHttps = url.protocol === "https:";
  const protocol = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const request = protocol.request(
      {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        ...(isHttps && insecureAgent ? { agent: insecureAgent } : {}),
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let data: RedeemedDownloadToken = { orgName: null, name: null };
          try {
            data = JSON.parse(text || "{}") as RedeemedDownloadToken;
          } catch {
            // An upstream error body is not part of the public response contract.
          }
          const status = response.statusCode ?? 500;
          resolve({ ok: status >= 200 && status < 300, status, data });
        });
      },
    );
    request.on("error", reject);
    request.write(body);
    request.end();
  });
}
