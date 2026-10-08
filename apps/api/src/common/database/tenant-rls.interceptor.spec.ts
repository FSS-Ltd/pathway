import type { CallHandler } from "@nestjs/common";
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
