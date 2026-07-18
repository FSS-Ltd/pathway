import { getOrgCapabilities, type Capability } from "@pathway/platform";
import { PlatformController } from "../platform.controller";

jest.mock("@pathway/platform", () => ({
  getOrgCapabilities: jest.fn(),
}));

const mockGetOrgCapabilities = getOrgCapabilities as jest.MockedFunction<
  typeof getOrgCapabilities
>;

describe("PlatformController", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns the current organisation capabilities", async () => {
    const capabilities: Capability[] = ["finance.invoices", "people.directory"];
    mockGetOrgCapabilities.mockResolvedValue(capabilities);
    const controller = new PlatformController();

    await expect(controller.capabilities("org-1")).resolves.toEqual({
      capabilities,
    });
    expect(mockGetOrgCapabilities).toHaveBeenCalledWith("org-1");
  });
});
