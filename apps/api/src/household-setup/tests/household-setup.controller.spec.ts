import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { HouseholdSetupController } from "../household-setup.controller";
import { HouseholdSetupService } from "../household-setup.service";
import { AuthUserGuard } from "../../auth/auth-user.guard";

const getStatusMock = jest.fn();
const updateLearningDaysMock = jest.fn();
const completeSetupMock = jest.fn();
const getPlanningPreferencesMock = jest.fn();
const updatePlanningPreferencesMock = jest.fn();
const getNotificationPreferencesMock = jest.fn();
const updateNotificationPreferencesMock = jest.fn();

const mockService = {
  getStatus: getStatusMock,
  updateLearningDays: updateLearningDaysMock,
  completeSetup: completeSetupMock,
  getPlanningPreferences: getPlanningPreferencesMock,
  updatePlanningPreferences: updatePlanningPreferencesMock,
  getNotificationPreferences: getNotificationPreferencesMock,
  updateNotificationPreferences: updateNotificationPreferencesMock,
} as unknown as HouseholdSetupService;

describe("HouseholdSetupController", () => {
  let controller: HouseholdSetupController;
  const tenantId = "tenant-a";

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HouseholdSetupController],
      providers: [{ provide: HouseholdSetupService, useValue: mockService }],
    })
      .overrideGuard(AuthUserGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<HouseholdSetupController>(HouseholdSetupController);
  });

  it("returns the current household's setup status", async () => {
    getStatusMock.mockResolvedValueOnce({ learningDays: [], setupCompletedAt: null });

    await expect(controller.status(tenantId)).resolves.toEqual({
      learningDays: [],
      setupCompletedAt: null,
    });
    expect(getStatusMock).toHaveBeenCalledWith(tenantId);
  });

  it("updates learning days from a valid body", async () => {
    updateLearningDaysMock.mockResolvedValueOnce({ learningDays: ["Mon"], setupCompletedAt: null });

    await controller.updateLearningDays({ days: ["Mon"] }, tenantId);

    expect(updateLearningDaysMock).toHaveBeenCalledWith({ days: ["Mon"] }, tenantId);
  });

  it("rejects an unknown weekday value", () => {
    expect(() => controller.updateLearningDays({ days: ["Someday"] }, tenantId)).toThrow(
      BadRequestException,
    );
    expect(updateLearningDaysMock).not.toHaveBeenCalled();
  });

  it("marks setup complete", async () => {
    completeSetupMock.mockResolvedValueOnce({ learningDays: [], setupCompletedAt: new Date() });

    await controller.completeSetup(tenantId);

    expect(completeSetupMock).toHaveBeenCalledWith(tenantId);
  });

  it("returns planning preferences", async () => {
    getPlanningPreferencesMock.mockResolvedValueOnce({
      weekStartsOn: "Mon",
      defaultActivityDurationMinutes: 45,
      dailyPlanningLimit: 2,
      timeFormat: "24h",
      language: "en-GB",
    });

    await controller.getPlanningPreferences(tenantId);

    expect(getPlanningPreferencesMock).toHaveBeenCalledWith(tenantId);
  });

  it("updates planning preferences from a valid body", async () => {
    updatePlanningPreferencesMock.mockResolvedValueOnce({ timeFormat: "12h" });

    await controller.updatePlanningPreferences({ timeFormat: "12h" }, tenantId);

    expect(updatePlanningPreferencesMock).toHaveBeenCalledWith({ timeFormat: "12h" }, tenantId);
  });

  it("rejects an unknown weekStartsOn value", () => {
    expect(() =>
      controller.updatePlanningPreferences({ weekStartsOn: "Wed" }, tenantId),
    ).toThrow(BadRequestException);
    expect(updatePlanningPreferencesMock).not.toHaveBeenCalled();
  });

  it("returns notification preferences", async () => {
    getNotificationPreferencesMock.mockResolvedValueOnce({
      todaySummary: true,
      activityReminders: true,
      tasksDue: true,
      communityHellos: true,
      channelActivity: true,
      meetupsNearby: false,
      quietHours: { start: "20:30", end: "07:30", enabled: true },
    });

    await controller.getNotificationPreferences(tenantId);

    expect(getNotificationPreferencesMock).toHaveBeenCalledWith(tenantId);
  });

  it("updates notification preferences from a valid body", async () => {
    updateNotificationPreferencesMock.mockResolvedValueOnce({ meetupsNearby: true });

    await controller.updateNotificationPreferences({ meetupsNearby: true }, tenantId);

    expect(updateNotificationPreferencesMock).toHaveBeenCalledWith({ meetupsNearby: true }, tenantId);
  });

  it("rejects an invalid notification preferences body", () => {
    expect(() =>
      controller.updateNotificationPreferences({ todaySummary: "yes" }, tenantId),
    ).toThrow(BadRequestException);
    expect(updateNotificationPreferencesMock).not.toHaveBeenCalled();
  });
});
