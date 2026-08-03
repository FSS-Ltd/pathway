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

  describe("planning preferences", () => {
    it("returns defaults when no preferences have been set", async () => {
      tenantFindUniqueOrThrow.mockResolvedValueOnce({ planningPreferences: {} });

      await expect(service.getPlanningPreferences(tenantId)).resolves.toEqual({
        weekStartsOn: "Mon",
        defaultActivityDurationMinutes: 45,
        dailyPlanningLimit: 2,
        timeFormat: "24h",
        language: "en-GB",
      });
    });

    it("merges a partial update into existing preferences", async () => {
      tenantFindUniqueOrThrow.mockResolvedValueOnce({ planningPreferences: { timeFormat: "24h" } });
      tenantUpdate.mockResolvedValueOnce({ planningPreferences: { timeFormat: "12h" } });

      const result = await service.updatePlanningPreferences({ timeFormat: "12h" }, tenantId);

      expect(tenantUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: tenantId },
          data: { planningPreferences: expect.objectContaining({ timeFormat: "12h" }) },
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({ timeFormat: "12h", weekStartsOn: "Mon" }),
      );
    });
  });

  describe("notification preferences", () => {
    it("returns defaults when no preferences have been set", async () => {
      tenantFindUniqueOrThrow.mockResolvedValueOnce({ notificationPreferences: {} });

      await expect(service.getNotificationPreferences(tenantId)).resolves.toEqual({
        todaySummary: true,
        activityReminders: true,
        tasksDue: true,
        communityHellos: true,
        channelActivity: true,
        meetupsNearby: false,
        quietHours: { start: "20:30", end: "07:30", enabled: true },
      });
    });

    it("merges a partial update into existing preferences", async () => {
      tenantFindUniqueOrThrow.mockResolvedValueOnce({ notificationPreferences: { meetupsNearby: false } });
      tenantUpdate.mockResolvedValueOnce({ notificationPreferences: { meetupsNearby: true } });

      const result = await service.updateNotificationPreferences({ meetupsNearby: true }, tenantId);

      expect(tenantUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: tenantId },
          data: { notificationPreferences: expect.objectContaining({ meetupsNearby: true }) },
        }),
      );
      expect(result).toEqual(expect.objectContaining({ meetupsNearby: true, todaySummary: true }));
    });
  });
});
