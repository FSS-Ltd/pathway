const path = require("node:path");

process.env.TSX_TSCONFIG_PATH ||= path.resolve(__dirname, "../tsconfig.json");

require("tsx/cjs");
require("reflect-metadata");

const express = require("express");
const { NestFactory } = require("@nestjs/core");
const { ExpressAdapter } = require("@nestjs/platform-express");
const { AppModule } = require("../src/app.module.ts");
const {
  configureApiApplication,
  createApiNestApplicationOptions,
} = require("../src/config/api-bootstrap.ts");
const {
  normalizeVercelRequestUrl,
} = require("../src/config/vercel-request-url.ts");

let server;
let bootstrapPromise;

async function createServer() {
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

async function getServer() {
  if (server) return server;
  bootstrapPromise ||= createServer();
  server = await bootstrapPromise;
  return server;
}

async function handler(req, res) {
  req.url = normalizeVercelRequestUrl(req.url);
  const expressServer = await getServer();
  expressServer(req, res);
}

module.exports = handler;
module.exports.default = handler;
