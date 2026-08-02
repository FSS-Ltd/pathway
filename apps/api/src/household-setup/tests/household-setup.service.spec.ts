const tenantFindUniqueOrThrow = jest.fn();
const tenantUpdate = jest.fn();

jest.mock("@pathway/db", () => ({
  prisma: {
    tenant: { findUniqueOrThrow: tenantFindUniqueOrThrow, update: tenantUpdate },
  },
}));

import { HouseholdSetupService } from "../household-setup.service";

describe("HouseholdSetupService", () => {
  const tenantId = "tenant-a";
  let service: HouseholdSetupService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new HouseholdSetupService();
  });

  it("reads the current household's setup status", async () => {
    tenantFindUniqueOrThrow.mockResolvedValueOnce({ learningDays: [], setupCompletedAt: null });

    await expect(service.getStatus(tenantId)).resolves.toEqual({
      learningDays: [],
      setupCompletedAt: null,
    });
    expect(tenantFindUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: tenantId } }),
    );
  });

  it("saves the chosen learning days", async () => {
    tenantUpdate.mockResolvedValueOnce({ learningDays: ["Mon", "Tue"], setupCompletedAt: null });

    await service.updateLearningDays({ days: ["Mon", "Tue"] }, tenantId);

    expect(tenantUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: tenantId },
        data: { learningDays: ["Mon", "Tue"] },
      }),
    );
  });

  it("marks setup complete with the current time", async () => {
    tenantUpdate.mockResolvedValueOnce({ learningDays: [], setupCompletedAt: new Date() });

    await service.completeSetup(tenantId);

    expect(tenantUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: tenantId },
        data: { setupCompletedAt: expect.any(Date) },
      }),
    );
  });
});
