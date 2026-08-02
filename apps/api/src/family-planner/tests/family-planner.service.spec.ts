import { NotFoundException } from "@nestjs/common";

const activityFindMany = jest.fn();
const activityCreate = jest.fn();
const taskFindMany = jest.fn();
const taskCreate = jest.fn();
const taskFindFirst = jest.fn();
const taskUpdate = jest.fn();
const calendarItemFindMany = jest.fn();
const calendarItemCreate = jest.fn();

jest.mock("@pathway/db", () => ({
  prisma: {
    activity: { findMany: activityFindMany, create: activityCreate },
    task: {
      findMany: taskFindMany,
      create: taskCreate,
      findFirst: taskFindFirst,
      update: taskUpdate,
    },
    calendarItem: { findMany: calendarItemFindMany, create: calendarItemCreate },
  },
}));

import { FamilyPlannerService } from "../family-planner.service";

describe("FamilyPlannerService", () => {
  const tenantId = "tenant-a";
  const userId = "user-a";
  let service: FamilyPlannerService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FamilyPlannerService();
  });

  it("lists activities within the current tenant, ordered by scheduledAt", async () => {
    activityFindMany.mockResolvedValueOnce([]);

    await expect(service.listActivities(tenantId)).resolves.toEqual([]);
    expect(activityFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId },
        orderBy: { scheduledAt: "asc" },
      }),
    );
  });

  it("creates an activity with defaults for optional fields", async () => {
    activityCreate.mockResolvedValueOnce({ id: "activity-1" });

    await service.createActivity(
      { childId: "child-1", title: "Nature walk", scheduledAt: new Date("2026-08-05T11:00:00Z") },
      tenantId,
      userId,
    );

    expect(activityCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId,
          childId: "child-1",
          title: "Nature walk",
          subjectIds: [],
          durationMinutes: null,
          planNotes: null,
          resourcesNote: null,
          createdByUserId: userId,
        }),
      }),
    );
  });

  it("lists tasks ordered by completion then due date", async () => {
    taskFindMany.mockResolvedValueOnce([]);

    await expect(service.listTasks(tenantId)).resolves.toEqual([]);
    expect(taskFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId },
        orderBy: [{ completedAt: "asc" }, { dueAt: "asc" }],
      }),
    );
  });

  it("creates a task defaulting priority to NORMAL", async () => {
    taskCreate.mockResolvedValueOnce({ id: "task-1" });

    await service.createTask({ title: "Renew library books" }, tenantId, userId);

    expect(taskCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId,
          title: "Renew library books",
          priority: "NORMAL",
          assignedToUserId: null,
          dueAt: null,
          createdByUserId: userId,
        }),
      }),
    );
  });

  it("completes a task that exists in the tenant", async () => {
    taskFindFirst.mockResolvedValueOnce({ id: "task-1" });
    taskUpdate.mockResolvedValueOnce({ id: "task-1", completedAt: new Date() });

    await service.completeTask("task-1", tenantId);

    expect(taskFindFirst).toHaveBeenCalledWith({ where: { id: "task-1", tenantId } });
    expect(taskUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "task-1" },
        data: expect.objectContaining({ completedAt: expect.any(Date) }),
      }),
    );
  });

  it("refuses to complete a task from another tenant", async () => {
    taskFindFirst.mockResolvedValueOnce(null);

    await expect(service.completeTask("task-1", tenantId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(taskUpdate).not.toHaveBeenCalled();
  });

  it("lists calendar items ordered by scheduledAt", async () => {
    calendarItemFindMany.mockResolvedValueOnce([]);

    await expect(service.listCalendarItems(tenantId)).resolves.toEqual([]);
    expect(calendarItemFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId },
        orderBy: { scheduledAt: "asc" },
      }),
    );
  });

  it("creates a calendar item with defaults for optional fields", async () => {
    calendarItemCreate.mockResolvedValueOnce({ id: "calendar-1" });

    await service.createCalendarItem(
      { title: "Library visit", scheduledAt: new Date("2026-08-05T14:00:00Z") },
      tenantId,
      userId,
    );

    expect(calendarItemCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId,
          title: "Library visit",
          who: null,
          location: null,
          createdByUserId: userId,
        }),
      }),
    );
  });
});
