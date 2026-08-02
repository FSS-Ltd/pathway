import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { FamilyPlannerController } from "../family-planner.controller";
import { FamilyPlannerService } from "../family-planner.service";
import { AuthUserGuard } from "../../auth/auth-user.guard";
import { CapabilityGuard } from "../../platform/capability.guard";

const listActivitiesMock = jest.fn();
const createActivityMock = jest.fn();
const listTasksMock = jest.fn();
const createTaskMock = jest.fn();
const completeTaskMock = jest.fn();
const listCalendarItemsMock = jest.fn();
const createCalendarItemMock = jest.fn();

const mockService = {
  listActivities: listActivitiesMock,
  createActivity: createActivityMock,
  listTasks: listTasksMock,
  createTask: createTaskMock,
  completeTask: completeTaskMock,
  listCalendarItems: listCalendarItemsMock,
  createCalendarItem: createCalendarItemMock,
} as unknown as FamilyPlannerService;

describe("FamilyPlannerController", () => {
  let controller: FamilyPlannerController;
  const tenantId = "tenant-a";
  const userId = "11111111-1111-1111-1111-111111111111";
  const childId = "22222222-2222-2222-2222-222222222222";

  function requestWithUser(id: string) {
    return { authUserId: id } as unknown as Parameters<
      FamilyPlannerController["createActivity"]
    >[2];
  }

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FamilyPlannerController],
      providers: [{ provide: FamilyPlannerService, useValue: mockService }],
    })
      .overrideGuard(AuthUserGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CapabilityGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<FamilyPlannerController>(FamilyPlannerController);
  });

  it("lists activities for the current tenant", async () => {
    listActivitiesMock.mockResolvedValueOnce([]);

    await expect(controller.listActivities(tenantId)).resolves.toEqual([]);
    expect(listActivitiesMock).toHaveBeenCalledWith(tenantId);
  });

  it("creates an activity from a valid body", async () => {
    createActivityMock.mockResolvedValueOnce({ id: "activity-1" });

    const body = { childId, title: "Nature walk", scheduledAt: "2026-08-05T11:00:00.000Z" };
    await controller.createActivity(body, tenantId, requestWithUser(userId));

    expect(createActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({ childId, title: "Nature walk" }),
      tenantId,
      userId,
    );
  });

  it("rejects an activity body missing required fields", () => {
    expect(() =>
      controller.createActivity({ childId }, tenantId, requestWithUser(userId)),
    ).toThrow(BadRequestException);
    expect(createActivityMock).not.toHaveBeenCalled();
  });

  it("rejects an activity body with unknown fields", () => {
    const body = {
      childId,
      title: "Nature walk",
      scheduledAt: "2026-08-05T11:00:00.000Z",
      notAField: true,
    };
    expect(() =>
      controller.createActivity(body, tenantId, requestWithUser(userId)),
    ).toThrow(BadRequestException);
    expect(createActivityMock).not.toHaveBeenCalled();
  });

  it("creates a task from a valid body", async () => {
    createTaskMock.mockResolvedValueOnce({ id: "task-1" });

    const body = { title: "Renew library books" };
    await controller.createTask(body, tenantId, requestWithUser(userId));

    expect(createTaskMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Renew library books" }),
      tenantId,
      userId,
    );
  });

  it("completes a task by validated id", async () => {
    completeTaskMock.mockResolvedValueOnce({ id: "task-1", completedAt: new Date() });

    expect(() => controller.completeTask("task-1-not-a-uuid", tenantId)).toThrow(
      BadRequestException,
    );
    expect(completeTaskMock).not.toHaveBeenCalled();

    await controller.completeTask(userId, tenantId);
    expect(completeTaskMock).toHaveBeenCalledWith(userId, tenantId);
  });

  it("creates a calendar item from a valid body", async () => {
    createCalendarItemMock.mockResolvedValueOnce({ id: "calendar-1" });

    const body = { title: "Library visit", scheduledAt: "2026-08-05T14:00:00.000Z" };
    await controller.createCalendarItem(body, tenantId, requestWithUser(userId));

    expect(createCalendarItemMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Library visit" }),
      tenantId,
      userId,
    );
  });

  it("requires authentication to create records", () => {
    expect(() => controller.createTask({ title: "x" }, tenantId, {} as never)).toThrow(
      BadRequestException,
    );
    expect(createTaskMock).not.toHaveBeenCalled();
  });
});
