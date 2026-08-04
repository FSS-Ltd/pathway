/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { AuthUserGuard } from "../../auth/auth-user.guard";
import { PreferencesController } from "../preferences.controller";
import { PreferencesService } from "../preferences.service";
import { Weekday } from "@pathway/db";

describe("PreferencesController", () => {
  let controller: PreferencesController;
  let service: jest.Mocked<PreferencesService>;

  const now = new Date("2025-01-01T12:00:00.000Z");
  const tenantId = "t1";

  const basePref = {
    id: "11111111-1111-1111-1111-111111111111",
    userId: "22222222-2222-2222-2222-222222222222",
    tenantId,
    weekday: Weekday.MON,
    startMinute: 9 * 60, // 09:00
    endMinute: 12 * 60, // 12:00
    createdAt: now,
    updatedAt: now,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PreferencesController],
      providers: [
        {
          provide: PreferencesService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(AuthUserGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PreferencesController>(PreferencesController);
    service = module.get(PreferencesService);
  });

  describe("create", () => {
    it("should validate body and call service.create", async () => {
      service.create.mockResolvedValue({ ...basePref });

      const dto = {
        userId: basePref.userId,
        weekday: Weekday.MON,
        startMinute: 540,
        endMinute: 600,
      };

      const result = await controller.create(dto, tenantId);
      expect(service.create).toHaveBeenCalledWith(
        { ...dto, tenantId },
        tenantId,
      );
      expect(result).toEqual(basePref);
    });

    it("should 400 when endMinute <= startMinute", async () => {
      const bad = {
        userId: basePref.userId,
        tenantId,
        weekday: Weekday.MON,
        startMinute: 600,
        endMinute: 600,
      };

      await expect(controller.create(bad, tenantId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(service.create).not.toHaveBeenCalled();
    });
  });

  describe("findAll", () => {
    it("should call service.findAll with tenant filter", async () => {
      const list = [{ ...basePref }];
      service.findAll.mockResolvedValue(list as any);

      const result = await controller.findAll(tenantId);
      expect(service.findAll).toHaveBeenCalledWith({ tenantId });
      expect(result).toEqual(list);
    });
  });

  describe("findOne", () => {
    it("should validate id and call service.findOne", async () => {
      service.findOne.mockResolvedValue({ ...basePref } as any);

      const result = await controller.findOne({ id: basePref.id }, tenantId);
      expect(service.findOne).toHaveBeenCalledWith(basePref.id, tenantId);
      expect(result).toEqual(basePref);
    });

    it("should 400 on invalid uuid", async () => {
      await expect(
        controller.findOne({ id: "not-a-uuid" }, tenantId),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(service.findOne).not.toHaveBeenCalled();
    });
  });

  describe("update", () => {
    it("should validate id + body and call service.update", async () => {
      const patch = { weekday: Weekday.TUE, startMinute: 600, endMinute: 720 };
      const updated = { ...basePref, ...patch, updatedAt: new Date(now) };
      service.update.mockResolvedValue(updated as any);

      const result = await controller.update(
        { id: basePref.id },
        patch,
        tenantId,
      );
      expect(service.update).toHaveBeenCalledWith(basePref.id, patch, tenantId);
      expect(result).toEqual(updated);
    });

    it("should 400 when minutes out of range", async () => {
      const patch = { startMinute: -1 };
      await expect(
        controller.update({ id: basePref.id }, patch, tenantId),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(service.update).not.toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    it("should validate id and call service.remove", async () => {
      service.remove.mockResolvedValue({} as any);

      const res = await controller.remove({ id: basePref.id }, tenantId);
      expect(service.remove).toHaveBeenCalledWith(basePref.id, tenantId);
      expect(res).toEqual({});
    });
  });
});
