import {
  ForbiddenException,
  NotFoundException,
  type CallHandler,
  type ExecutionContext,
} from "@nestjs/common";
import { lastValueFrom, of, throwError } from "rxjs";
import { MessagingBoundaryAuditInterceptor } from "../messaging-boundary-audit.interceptor";

const context = {
  getClass: () => ({ name: "MessagingController" }),
  getHandler: () => ({ name: "messages" }),
} as ExecutionContext;

function setup() {
  const warn = jest.fn();
  const logging = { createLogger: jest.fn().mockReturnValue({ warn }) };
  const requestContext = {
    getContext: jest.fn().mockReturnValue({
      org: { orgId: "org-a" },
      tenant: { tenantId: "site-a" },
      user: { userId: "user-a" },
    }),
  };
  return {
    warn,
    interceptor: new MessagingBoundaryAuditInterceptor(
      logging as never,
      requestContext as never,
    ),
  };
}

describe("messaging boundary audit", () => {
  it.each([NotFoundException, ForbiddenException])(
    "records a denied conversation boundary without request content",
    async (Exception) => {
      const { warn, interceptor } = setup();
      const error = new Exception("Private message content");
      const next = {
        handle: () => throwError(() => error),
      } as CallHandler;

      await expect(
        lastValueFrom(interceptor.intercept(context, next)),
      ).rejects.toBe(error);
      expect(warn).toHaveBeenCalledWith("messaging-boundary-denied", {
        orgId: "org-a",
        tenantId: "site-a",
        actorUserId: "user-a",
        operation: "MessagingController.messages",
        status: error.getStatus(),
      });
      expect(JSON.stringify(warn.mock.calls)).not.toContain(
        "Private message content",
      );
    },
  );

  it("does not record a successful read", async () => {
    const { warn, interceptor } = setup();
    const next = { handle: () => of({ items: [] }) } as CallHandler;

    await expect(
      lastValueFrom(interceptor.intercept(context, next)),
    ).resolves.toEqual({ items: [] });
    expect(warn).not.toHaveBeenCalled();
  });
});
