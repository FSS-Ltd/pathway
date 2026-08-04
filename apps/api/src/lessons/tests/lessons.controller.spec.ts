import { Test } from "@nestjs/testing";
import { LessonsController } from "../lessons.controller";
import { LessonsService } from "../lessons.service";
import { AuthUserGuard } from "../../auth/auth-user.guard";

type Lesson = {
  id: string;
  tenantId: string;
  groupId: string | null;
  title: string;
  description: string | null;
  fileKey: string | null;
  weekOf: Date;
};

type CreateLessonBody = {
  tenantId: string;
  groupId?: string;
  title: string;
  weekOf: string; // raw ISO date string from client
};

type UpdateLessonBody = {
  title?: string;
  description?: string | null;
  fileKey?: string | null;
  groupId?: string | null;
  weekOf?: string; // raw ISO date string from client
};

type ListQuery = {
  groupId?: string;
  weekOf?: string;
};

// Create a typed mock of LessonsService
const mockService = () => ({
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  getResourceFile: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
});

describe("LessonsController", () => {
  let controller: LessonsController;
  let service: ReturnType<typeof mockService>;

  const tenantId = "11111111-1111-1111-1111-111111111111";
  const groupId = "22222222-2222-2222-2222-222222222222";
  const lessonId = "33333333-3333-3333-3333-333333333333";

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [LessonsController],
      providers: [{ provide: LessonsService, useFactory: mockService }],
    })
      .overrideGuard(AuthUserGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get(LessonsController);
    service = moduleRef.get(LessonsService);
  });

  describe("create", () => {
    it("coerces weekOf ISO string and calls service.create", async () => {
      const body: CreateLessonBody = {
        tenantId,
        groupId,
        title: "New Lesson",
        weekOf: "2025-01-06", // ISO date (no time)
      };

      const created: Lesson = {
        id: lessonId,
        tenantId,
        groupId,
        title: body.title,
        description: null,
        fileKey: null,
        weekOf: new Date("2025-01-06T00:00:00.000Z"),
      };

      service.create.mockResolvedValue(created);

      const res = await controller.create(body as unknown, tenantId);

      expect(service.create).toHaveBeenCalledTimes(1);
      const [argDto, argTenant] = service.create.mock.calls[0];
      expect(argDto.weekOf instanceof Date).toBe(true);
      expect(argTenant).toBe(tenantId);
      expect(res).toEqual(created);
    });
  });

  describe("findAll", () => {
    it("coerces weekOf query and passes filters to service.findAll", async () => {
      const query: ListQuery = {
        groupId,
        weekOf: "2025-01-06",
      };

      const items: Lesson[] = [
        {
          id: lessonId,
          tenantId,
          groupId,
          title: "A",
          weekOf: new Date("2025-01-06T00:00:00.000Z"),
          description: null,
          fileKey: null,
        },
      ];
      service.findAll.mockResolvedValue(items);

      const res = await controller.findAll(query, tenantId);

      expect(service.findAll).toHaveBeenCalledTimes(1);
      const filters = service.findAll.mock.calls[0][0];
      // Controller should convert weekOf string into a Date-based filter
      // We support either {weekOfFrom, weekOfTo} or a single {weekOf}
      const hasDateFilter =
        (filters.weekOfFrom instanceof Date &&
          filters.weekOfTo instanceof Date) ||
        filters.weekOf instanceof Date;
      expect(hasDateFilter).toBe(true);
      expect(filters.tenantId).toBe(tenantId);
      expect(filters.groupId).toBe(groupId);
      expect(res).toEqual(items);
    });
  });

  describe("findOne", () => {
    it("returns a single lesson", async () => {
      const item: Partial<Lesson> & { id: string } = {
        id: lessonId,
        tenantId,
        groupId,
        title: "A",
      };
      service.findOne.mockResolvedValue(item);
      await expect(controller.findOne(lessonId, tenantId)).resolves.toEqual(
        item,
      );
      expect(service.findOne).toHaveBeenCalledWith(lessonId, tenantId);
    });
  });

  describe("update", () => {
    it("coerces weekOf ISO string on update and calls service.update", async () => {
      const patch: UpdateLessonBody = {
        title: "Renamed",
        weekOf: "2025-01-13",
      };
      const updated: Partial<Lesson> & { id: string } = {
        id: lessonId,
        title: "Renamed",
        weekOf: new Date("2025-01-13T00:00:00.000Z"),
      };
      service.update.mockResolvedValue(updated);

      const res = await controller.update(lessonId, patch, tenantId);

      expect(service.update).toHaveBeenCalledTimes(1);
      const [, argDto, argTenant] = service.update.mock.calls[0];
      expect(argDto.weekOf instanceof Date).toBe(true);
      expect(argTenant).toBe(tenantId);
      expect(res).toEqual(updated);
    });
  });

  describe("remove", () => {
    it("calls service.remove and returns result", async () => {
      const deleted: { id: string } = { id: lessonId };
      service.remove.mockResolvedValue(deleted);
      const res = await controller.remove(lessonId, tenantId);
      expect(service.remove).toHaveBeenCalledWith(lessonId, tenantId);
      expect(res).toEqual(deleted);
    });
  });
});
