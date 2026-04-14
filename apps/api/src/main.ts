import "reflect-metadata";
import { config } from "dotenv";
import path from "node:path";

// Load .env from cwd (e.g. apps/api), then from repo root so RESEND_API_KEY etc. are available
config();
config({
  path: path.resolve(process.cwd(), "../../.env"),
  override: false,
});

import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import { json, urlencoded } from "express";
import type { NextFunction, Request, Response } from "express";
import cookieParser from "cookie-parser";
import fs from "node:fs";
import type { HttpsOptions } from "@nestjs/common/interfaces/external/https-options.interface";

function readHttpsOptionsFromEnv(): HttpsOptions | undefined {
  // Keep local API on HTTP by default. Enable HTTPS explicitly when needed.
  if (process.env.API_ENABLE_HTTPS !== "true") {
    return undefined;
  }

  const keyPath = process.env.API_DEV_SSL_KEY ?? process.env.NEXT_DEV_SSL_KEY;
  const certPath =
    process.env.API_DEV_SSL_CERT ?? process.env.NEXT_DEV_SSL_CERT;

  if (!keyPath || !certPath) return undefined;

  if (!fs.existsSync(keyPath)) {
    throw new Error(`HTTPS key file not found at: ${keyPath}`);
  }
  if (!fs.existsSync(certPath)) {
    throw new Error(`HTTPS cert file not found at: ${certPath}`);
  }

  return {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  };
}

async function bootstrap() {
  const httpsOptions = readHttpsOptionsFromEnv();

  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: true,
      credentials: true,
    },
    ...(httpsOptions ? { httpsOptions } : {}),
    rawBody: true,
    bodyParser: false, // Use our own parsers below so we can set a 15MB limit for lesson uploads
  });

  // JSON and urlencoded with 15MB limit (lesson resource base64 ~10MB file → ~14MB payload)
  const bodyLimit = "15mb";
  app.use(
    json({
      limit: bodyLimit,
      verify: (req: unknown, _res, buf) => {
        (req as { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  app.use(urlencoded({ extended: true, limit: bodyLimit }));

  app.use(cookieParser());

  // Dev tracing for login/bootstrap diagnostics.
  const traceRequests =
    process.env.API_DEBUG_REQUESTS === "true" || process.env.NODE_ENV !== "production";
  if (traceRequests) {
    app.use((req: Request, res: Response, next: NextFunction) => {
      const path = req.path ?? req.url ?? "";
      const shouldTrace =
        path.startsWith("/health") ||
        path.startsWith("/auth") ||
        path.startsWith("/attendance") ||
        path.startsWith("/sessions");

      if (!shouldTrace) return next();

      const startedAt = Date.now();
      console.log(`[api-debug] -> ${req.method} ${path}`);
      res.on("finish", () => {
        console.log(
          `[api-debug] <- ${req.method} ${path} ${res.statusCode} (${Date.now() - startedAt}ms)`,
        );
      });
      next();
    });
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.API_PORT ? Number(process.env.API_PORT) : 3001;
  await app.listen(port);

  const host = process.env.API_HOST ?? "api.localhost";
  const scheme = httpsOptions ? "https" : "http";

  console.log(`🚀 API listening on ${scheme}://${host}:${port}`);
}

void bootstrap().catch((err: unknown) => {
  // Fail fast in dev if HTTPS files are missing/misconfigured.
  console.error("Failed to start API", err);
  process.exit(1);
});
