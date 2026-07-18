import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import type { PathwayRequestContext } from "@pathway/auth";
import { orgHasCapability, type Capability } from "@pathway/platform";
import { CapabilityGuard } from "../capability.guard";

jest.mock("@pathway/platform", () => ({
  orgHasCapability: jest.fn(),
}));

const mockOrgHasCapability = orgHasCapability as jest.MockedFunction<
  typeof orgHasCapability
>;

describe("CapabilityGuard", () => {
  const capability: Capability = "finance.invoices";
  const executionContext = {
    getHandler: jest.fn(),
    getClass: jest.fn(),
  } as unknown as ExecutionContext;

  let requiredCapability: Capability | undefined;
  let currentOrgId: string | null;
  let guard: CapabilityGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    requiredCapability = capability;
    currentOrgId = "org-1";

    const reflector = {
      getAllAndOverride: jest.fn(() => requiredCapability),
    } as unknown as Reflector;
    const requestContext = {
      get currentOrgId() {
        return currentOrgId;
      },
    } as PathwayRequestContext;

    guard = new CapabilityGuard(reflector, requestContext);
  });

  it("allows handlers without capability metadata", async () => {
    requiredCapability = undefined;

    await expect(guard.canActivate(executionContext)).resolves.toBe(true);
    expect(mockOrgHasCapability).not.toHaveBeenCalled();
  });

  it("allows an organisation with the required capability", async () => {
    mockOrgHasCapability.mockResolvedValue(true);

    await expect(guard.canActivate(executionContext)).resolves.toBe(true);
    expect(mockOrgHasCapability).toHaveBeenCalledWith("org-1", capability);
  });

  it("rejects an organisation without the required capability", async () => {
    mockOrgHasCapability.mockResolvedValue(false);

    await expect(guard.canActivate(executionContext)).rejects.toThrow(
      new ForbiddenException(`Missing capability: ${capability}`),
    );
  });

  it("rejects a request without an active organisation", async () => {
    currentOrgId = null;

    await expect(guard.canActivate(executionContext)).rejects.toThrow(
      new ForbiddenException("No active organisation"),
    );
    expect(mockOrgHasCapability).not.toHaveBeenCalled();
  });
});
