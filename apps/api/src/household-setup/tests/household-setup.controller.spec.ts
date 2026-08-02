import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { HouseholdSetupController } from "../household-setup.controller";
import { HouseholdSetupService } from "../household-setup.service";
import { AuthUserGuard } from "../../auth/auth-user.guard";

const getStatusMock = jest.fn();
const updateLearningDaysMock = jest.fn();
const completeSetupMock = jest.fn();

const mockService = {
  getStatus: getStatusMock,
  updateLearningDays: updateLearningDaysMock,
  completeSetup: completeSetupMock,
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
});
