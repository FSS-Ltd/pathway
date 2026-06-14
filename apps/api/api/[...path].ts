import { NestFactory } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";
import express from "express";
import { AppModule } from "../src/app.module";
import {
  configureApiApplication,
  createApiNestApplicationOptions,
} from "../src/config/api-bootstrap";

type ExpressServer = ReturnType<typeof express>;

let server: ExpressServer | undefined;
let bootstrapPromise: Promise<ExpressServer> | undefined;

async function createServer(): Promise<ExpressServer> {
  const expressServer = express();
  const app = await NestFactory.create(
    AppModule,
    new ExpressAdapter(expressServer),
    createApiNestApplicationOptions(),
  );

  configureApiApplication(app);
  await app.init();

  return expressServer;
}

async function getServer(): Promise<ExpressServer> {
  if (server) return server;
  bootstrapPromise ??= createServer();
  server = await bootstrapPromise;
  return server;
}

export function normalizeVercelRequestUrl(url: string | undefined): string {
  if (!url) return "/";
  if (url === "/api") return "/";
  if (url.startsWith("/api/")) return url.slice("/api".length);
  return url;
}

export default async function handler(
  req: Parameters<ExpressServer>[0],
  res: Parameters<ExpressServer>[1],
): Promise<void> {
  req.url = normalizeVercelRequestUrl(req.url);
  const expressServer = await getServer();
  expressServer(req, res);
}
