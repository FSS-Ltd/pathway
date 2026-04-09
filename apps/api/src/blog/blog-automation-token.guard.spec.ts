import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { BlogAutomationTokenGuard } from "./blog-automation-token.guard";
import { BlogAutomationTokenService } from "./blog-automation-token.service";
import type { AutomationRequest } from "./blog-automation-token.guard";

describe("BlogAutomationTokenGuard", () => {
  const tokenService = {
    authenticate: jest.fn(),
    assertWithinRateLimit: jest.fn(),
  } as unknown as BlogAutomationTokenService;

  const guard = new BlogAutomationTokenGuard(tokenService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function mockContext(headers: Record<string, string | undefined>) {
    const req = { headers } as unknown as AutomationRequest;
    return {
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
  }

  it("rejects when Authorization header is missing", async () => {
    await expect(guard.canActivate(mockContext({}))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("rejects malformed Authorization header", async () => {
    await expect(
      guard.canActivate(mockContext({ authorization: "Token abc" })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("attaches automation token details to request", async () => {
    (tokenService.authenticate as jest.Mock).mockResolvedValue({
      id: "tok_1",
      name: "cowork",
    });

    const req = {
      headers: { authorization: "Bearer abc123" },
    } as unknown as AutomationRequest;
    const context = {
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;

    const allowed = await guard.canActivate(context);

    expect(allowed).toBe(true);
    expect(req.automationToken).toEqual({ id: "tok_1", name: "cowork" });
    expect(tokenService.assertWithinRateLimit).toHaveBeenCalledWith("tok_1");
  });
});
