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
import {
  configureApiApplication,
  createApiNestApplicationOptions,
  resolveApiListenOptions,
} from "./config/api-bootstrap";

async function bootstrap() {
  const appOptions = createApiNestApplicationOptions();
  const app = await NestFactory.create(AppModule, appOptions);
  configureApiApplication(app);

  const { bindHost, host, port } = resolveApiListenOptions();
  await app.listen(port, bindHost);
  const scheme = appOptions.httpsOptions ? "https" : "http";

  console.log(
    `🚀 API listening on ${scheme}://${host}:${port} (bound to ${bindHost})`,
  );
}

void bootstrap().catch((err: unknown) => {
  // Fail fast in dev if HTTPS files are missing/misconfigured.
  console.error("Failed to start API", err);
  process.exit(1);
});
