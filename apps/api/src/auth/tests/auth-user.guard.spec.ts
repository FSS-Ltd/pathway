import { ExecutionContext, UnauthorizedException } from "@nestjs/common";

jest.mock("@pathway/db", () => ({
  prisma: {
    userIdentity: {
      findUnique: jest.fn(),
    },
    tenant: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("../token-verifier", () => ({
  verifyBearerToken: jest.fn(),
}));

import { prisma } from "@pathway/db";
import { AuthUserGuard } from "../auth-user.guard";
import { AuthIdentityService } from "../auth-identity.service";
import { verifyBearerToken } from "../token-verifier";

const findIdentity = prisma.userIdentity.findUnique as unknown as jest.Mock;
const verify = verifyBearerToken as unknown as jest.Mock;

function buildContext(headers: Record<string, string> = {}) {
  const req: Record<string, unknown> = {
    headers,
    cookies: {},
  };
  const res = { cookie: jest.fn() };
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
    req,
    res,
  } as unknown as ExecutionContext & { req: typeof req; res: typeof res };
}

const baseUser = {
  id: "user-1",
  email: "person@example.test",
  displayName: "Person One",
  name: null,
  lastActiveTenantId: null,
  siteMemberships: [],
  orgMemberships: [],
  orgRoles: [],
  roles: [],
};

describe("AuthUserGuard", () => {
  let authIdentityService: { upsertFromProvider: jest.Mock };
  let guard: AuthUserGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    authIdentityService = { upsertFromProvider: jest.fn() };
    guard = new AuthUserGuard(
      authIdentityService as unknown as AuthIdentityService,
    );
  });

  it("propagates verification failures without touching the database", async () => {
    verify.mockRejectedValueOnce(new UnauthorizedException("bad token"));
    const ctx = buildContext({ authorization: "Bearer whatever" });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(findIdentity).not.toHaveBeenCalled();
  });

  it("resolves an already-linked identity without provisioning", async () => {
    verify.mockResolvedValueOnce({
      provider: "clerk",
      sub: "clerk_abc",
      email: "person@example.test",
      emailVerified: true,
    });
    findIdentity.mockResolvedValueOnce({
      userId: "user-1",
      email: "person@example.test",
      user: baseUser,
    });

    const ctx = buildContext({ authorization: "Bearer token" });
    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(authIdentityService.upsertFromProvider).not.toHaveBeenCalled();
    expect((ctx.req as Record<string, unknown>).authUserId).toBe("user-1");
    const pathwayContext = (ctx.req as Record<string, unknown>)
      .__pathwayContext as { user: { authProvider: string } };
    expect(pathwayContext.user.authProvider).toBe("clerk");
  });

  it("JIT-provisions via AuthIdentityService when no identity is linked yet", async () => {
    verify.mockResolvedValueOnce({
      provider: "auth0",
      sub: "auth0|new-user",
      email: "new@example.test",
      emailVerified: true,
    });
    findIdentity
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        userId: "user-2",
        email: "new@example.test",
        user: { ...baseUser, id: "user-2" },
      });
    authIdentityService.upsertFromProvider.mockResolvedValueOnce({
      userId: "user-2",
    });

    const ctx = buildContext({ authorization: "Bearer token" });
    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(authIdentityService.upsertFromProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "auth0",
        subject: "auth0|new-user",
        email: "new@example.test",
        emailVerified: true,
      }),
    );
    expect((ctx.req as Record<string, unknown>).authUserId).toBe("user-2");
  });

  it("rejects when JIT provisioning fails, without leaking the internal error", async () => {
    verify.mockResolvedValueOnce({
      provider: "auth0",
      sub: "auth0|broken",
    });
    findIdentity.mockResolvedValueOnce(null);
    authIdentityService.upsertFromProvider.mockRejectedValueOnce(
      new Error("db unavailable"),
    );

    const ctx = buildContext({ authorization: "Bearer token" });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejects when provisioning succeeds but the identity still can't be found", async () => {
    verify.mockResolvedValueOnce({ provider: "auth0", sub: "auth0|ghost" });
    findIdentity.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    authIdentityService.upsertFromProvider.mockResolvedValueOnce({
      userId: "user-3",
    });

    const ctx = buildContext({ authorization: "Bearer token" });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
