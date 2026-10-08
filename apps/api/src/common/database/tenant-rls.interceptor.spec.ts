import type { CallHandler } from "@nestjs/common";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { Reflector } from "@nestjs/core";
import { ExecutionContextHost } from "@nestjs/core/helpers/execution-context-host";
import { firstValueFrom, of } from "rxjs";
import { AccessTagsController } from "../../access-control/access-tags.controller";
import { AssignmentsController } from "../../access-control/assignments.controller";
import { PaceInventoryCommandsController } from "../../pace/pace-inventory-commands.controller";
import {
  IndependentTransaction,
  INDEPENDENT_TRANSACTION,
} from "./independent-transaction.decorator";
import { TenantRlsInterceptor } from "./tenant-rls.interceptor";

@IndependentTransaction()
class OwnTransactionController {
  handle(): void {}
}

describe("TenantRlsInterceptor", () => {
  it("serves a public request through the production tsx loader", () => {
    const script = `
      const { Controller, Get, Module } = require('@nestjs/common');
      const { APP_INTERCEPTOR, NestFactory } = require('@nestjs/core');
      const { ExpressAdapter } = require('@nestjs/platform-express');
      const request = require('supertest');
      const { TenantRlsInterceptor } = require('./src/common/database/tenant-rls.interceptor.ts');
      class ProbeController { health() { return { status: 'ok' }; } }
      Get('env')(ProbeController.prototype, 'health', Object.getOwnPropertyDescriptor(ProbeController.prototype, 'health'));
      Controller('health')(ProbeController);
      class TestModule {}
      Module({ controllers: [ProbeController], providers: [{ provide: APP_INTERCEPTOR, useClass: TenantRlsInterceptor }] })(TestModule);
      NestFactory.create(TestModule, new ExpressAdapter(), { logger: false })
        .then(async (app) => {
          await app.init();
          const response = await request(app.getHttpServer()).get('/health/env');
          await app.close();
          process.exitCode = response.status === 200 && response.body.status === 'ok' ? 0 : 1;
        })
        .catch((error) => { console.error(error); process.exitCode = 1; });
    `;
    const result = spawnSync(
      process.execPath,
      ["-r", "tsx/cjs", "-r", "reflect-metadata", "-e", script],
      { cwd: path.resolve(__dirname, "../../.."), encoding: "utf8" },
    );

    expect(result.status).toBe(0);
  });

  it("keeps post-commit access actions and serializable inventory commands outside the request transaction", () => {
    for (const controller of [
      AssignmentsController,
      AccessTagsController,
      PaceInventoryCommandsController,
    ]) {
      expect(Reflect.getMetadata(INDEPENDENT_TRANSACTION, controller)).toBe(
        true,
      );
    }
  });

  it("leaves a route's explicitly owned transaction outside the request transaction", async () => {
    const controller = new OwnTransactionController();
    const context = new ExecutionContextHost(
      [
        {
          __pathwayContext: {
            tenant: { tenantId: "site-a" },
            org: { orgId: "org-a" },
          },
        },
      ],
      OwnTransactionController,
      controller.handle,
    );
    const next = { handle: () => of("ok") } as CallHandler;

    const result = await firstValueFrom(
      new TenantRlsInterceptor(new Reflector()).intercept(context, next),
    );

    expect(result).toBe("ok");
  });
});
