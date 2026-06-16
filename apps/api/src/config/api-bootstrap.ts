import {
  type INestApplication,
  type NestApplicationOptions,
  ValidationPipe,
} from "@nestjs/common";
import type { HttpsOptions } from "@nestjs/common/interfaces/external/https-options.interface";
import {
  json,
  urlencoded,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import cookieParser from "cookie-parser";
import fs from "node:fs";
import { getAllowedCorsOrigins, validateProductionEnv } from "./runtime-env";
import { stripVercelRoutingQueryParam } from "./vercel-request-url";

type CorsOriginCallback = (err: Error | null, allow?: boolean) => void;

export type ApiListenOptions = {
  bindHost: string;
  host: string;
  port: number;
};

export function createCorsOriginValidator(
  allowedOrigins: readonly string[],
): (origin: string | undefined, callback: CorsOriginCallback) => void {
  return (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS origin not allowed: ${origin}`), false);
  };
}

export function createApiNestApplicationOptions(): NestApplicationOptions {
  validateProductionEnv();
  const httpsOptions = readHttpsOptionsFromEnv();
  const allowedOrigins = getAllowedCorsOrigins();

  return {
    cors: {
      origin: createCorsOriginValidator(allowedOrigins),
      credentials: true,
    },
    ...(httpsOptions ? { httpsOptions } : {}),
    rawBody: true,
    bodyParser: false,
  };
}

export function configureApiApplication(app: INestApplication): void {
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
  app.use((req: Request, _res: Response, next: NextFunction) => {
    stripVercelRoutingQueryParam(req.query);
    next();
  });

  const traceRequests =
    process.env.API_DEBUG_REQUESTS === "true" ||
    process.env.NODE_ENV !== "production";
  if (traceRequests) {
    app.use((req: Request, res: Response, next: NextFunction) => {
      const requestPath = req.path ?? req.url ?? "";
      const shouldTrace =
        requestPath.startsWith("/health") ||
        requestPath.startsWith("/auth") ||
        requestPath.startsWith("/attendance") ||
        requestPath.startsWith("/sessions");

      if (!shouldTrace) return next();

      const startedAt = Date.now();
      console.log(`[api-debug] -> ${req.method} ${requestPath}`);
      res.on("finish", () => {
        console.log(
          `[api-debug] <- ${req.method} ${requestPath} ${res.statusCode} (${Date.now() - startedAt}ms)`,
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
}

export function resolveApiListenOptions(): ApiListenOptions {
  const port = Number(process.env.API_PORT ?? process.env.PORT ?? 3001);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(
      `Invalid API port: ${process.env.API_PORT ?? process.env.PORT}`,
    );
  }

  return {
    bindHost: process.env.API_BIND_HOST ?? process.env.HOSTNAME ?? "0.0.0.0",
    host: process.env.API_HOST ?? "api.localhost",
    port,
  };
}

export function readHttpsOptionsFromEnv(): HttpsOptions | undefined {
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
