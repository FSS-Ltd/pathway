import { BadRequestException } from "@nestjs/common";
import {
  getOrgCapabilities,
  VERTICAL_CAPABILITIES,
  type Capability,
} from "@pathway/platform";
import { PlatformController } from "../platform.controller";

jest.mock("@pathway/platform", () => ({
  getOrgCapabilities: jest.fn(),
  VERTICAL_CAPABILITIES: {
    CHURCH: ["attendance.read", "volunteers.manage"],
  },
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

  it("returns the selected vertical's capability preview", () => {
    const controller = new PlatformController();

    expect(controller.verticalCapabilities("CHURCH")).toEqual({
      capabilities: VERTICAL_CAPABILITIES.CHURCH,
    });
  });

  it("rejects an unknown vertical", () => {
    const controller = new PlatformController();

    expect(() => controller.verticalCapabilities("UNKNOWN")).toThrow(
      BadRequestException,
    );
  });
});
