import "reflect-metadata";
import express, { type Express, type Request, type Response } from "express";
import { NestFactory } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";
import { AppModule } from "../src/app.module";
import {
  configureApiApplication,
  createApiNestApplicationOptions,
} from "../src/config/api-bootstrap";
import { normalizeVercelRequestUrl } from "../src/config/vercel-request-url";

type ApiHandler = (request: Request, response: Response) => Promise<void>;
type ExpressHandler = ReturnType<typeof express>;
type ServerFactory = () => Promise<ExpressHandler>;

async function createServer(): Promise<Express> {
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

export function createServerlessHandler(
  serverFactory: ServerFactory = createServer,
): ApiHandler {
  let serverPromise: Promise<ExpressHandler> | undefined;

  return async (request, response) => {
    request.url = normalizeVercelRequestUrl(request.url);
    serverPromise ??= serverFactory();
    const server = await serverPromise;
    server(request, response);
  };
}

const handler = createServerlessHandler();
export default handler;
