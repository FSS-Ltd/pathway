import type { CallHandler } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ExecutionContextHost } from "@nestjs/core/helpers/execution-context-host";
import { firstValueFrom, of } from "rxjs";
import { IndependentTransaction } from "./independent-transaction.decorator";
import { TenantRlsInterceptor } from "./tenant-rls.interceptor";

@IndependentTransaction()
class OwnTransactionController {
  handle(): void {}
}

describe("TenantRlsInterceptor", () => {
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
