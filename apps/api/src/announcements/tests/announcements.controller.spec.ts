import { Test } from "@nestjs/testing";
import { AnnouncementsController } from "../announcements.controller";
import { AnnouncementsService } from "../announcements.service";
import { PathwayAuthGuard } from "@pathway/auth";
import { AuthUserGuard } from "../../auth/auth-user.guard";
import {
  Av30HardCapExceededError,
  EntitlementsEnforcementService,
} from "../../billing/entitlements-enforcement.service";

// Types used for strong typing in tests
type Audience = "ALL" | "PARENTS" | "STAFF";

type Announcement = {
  id: string;
  tenantId: string;
  title: string;
  body: string;
  audience: Audience;
  publishedAt: Date | null;
};

type CreateAnnouncementBody = {
  tenantId: string;
  title: string;
  body: string;
  audience?: Audience;
  publishedAt?: string; // raw ISO date from client
};

type UpdateAnnouncementBody = {
  title?: string;
  body?: string;
  audience?: Audience;
  publishedAt?: string; // raw ISO date from client
};

type ListQuery = {
  audience?: Audience;
  publishedOnly?: string | boolean; // comes from query string; controller coerces boolean
};

// Typed mock factory for the service
const mockService = () => ({
  create: jest.fn<Promise<Announcement>, [unknown, string]>(),
  findAll: jest.fn<
    Promise<Announcement[]>,
    [{ tenantId: string; audience?: Audience; publishedOnly?: boolean }]
  >(),
  findOne: jest.fn<Promise<Announcement>, [string, string]>(),
  update: jest.fn<Promise<Announcement>, [string, unknown, string]>(),
  remove: jest.fn<Promise<{ id: string }>, [string, string]>(),
});

const mockEnforcement = () => ({
  checkAv30ForOrg: jest.fn().mockResolvedValue({
    status: "OK",
    orgId: "org-1",
    currentAv30: 10,
    av30Cap: 100,
    graceUntil: null,
    messageCode: "av30.ok",
  }),
  assertWithinHardCap: jest.fn(),
});

describe("AnnouncementsController", () => {
  let controller: AnnouncementsController;
  let service: ReturnType<typeof mockService>;
  let enforcement: ReturnType<typeof mockEnforcement>;

  const tenantId = "11111111-1111-1111-1111-111111111111";
  const orgId = "org-123";
  const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AnnouncementsController],
      providers: [
        { provide: AnnouncementsService, useFactory: mockService },
        { provide: EntitlementsEnforcementService, useFactory: mockEnforcement },
      ],
    })
      .overrideGuard(PathwayAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AuthUserGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get(AnnouncementsController);
    service = moduleRef.get(AnnouncementsService);
    enforcement = moduleRef.get(EntitlementsEnforcementService);
  });

  describe("create", () => {
    it("parses body and calls service.create", async () => {
      const body: CreateAnnouncementBody = {
        tenantId,
        title: "Welcome",
        body: "We are live!",
        audience: "ALL",
        publishedAt: "2025-01-10",
      };
      const created: Announcement = {
        id,
        tenantId,
        title: body.title,
        body: body.body,
        audience: "ALL",
        publishedAt: new Date("2025-01-10T00:00:00.000Z"),
      };

      service.create.mockResolvedValue(created);

      const res = await controller.create(body as unknown, tenantId, orgId);
      expect(service.create).toHaveBeenCalledTimes(1);
      const [arg, argTenant] = service.create.mock.calls[0] as [
        {
          tenantId: string;
          title: string;
          body: string;
          audience: Audience;
          publishedAt: Date | null;
        },
        string,
      ];
      expect(arg.tenantId).toBe(tenantId);
      expect(arg.publishedAt instanceof Date || arg.publishedAt === null).toBe(
        true,
      );
      expect(argTenant).toBe(tenantId);
      expect(res).toEqual(created);
    });
  });

  describe("findAll", () => {
    it("parses query and forwards filters", async () => {
      const query: ListQuery = {
        audience: "PARENTS",
        publishedOnly: "true",
      };
      const items: Announcement[] = [
        {
          id,
          tenantId,
          title: "Parent msg",
          body: "hello",
          audience: "PARENTS",
          publishedAt: new Date("2025-01-10T00:00:00.000Z"),
        },
      ];
      service.findAll.mockResolvedValue(items);

      const res = await controller.findAll(query as unknown, tenantId);
      expect(service.findAll).toHaveBeenCalledTimes(1);
      const filters = service.findAll.mock.calls[0][0];
      expect(filters).toEqual({
        tenantId,
        audience: "PARENTS",
        publishedOnly: true,
      });
      expect(res).toEqual(items);
    });

    it("ignores Vercel routing metadata when parsing list filters", async () => {
      const query = {
        __vercel_path: "announcements",
        audience: "ALL",
      };
      const items: Announcement[] = [
        {
          id,
          tenantId,
          title: "General",
          body: "hello",
          audience: "ALL",
          publishedAt: null,
        },
      ];
      service.findAll.mockResolvedValue(items);

      const res = await controller.findAll(query, tenantId);

      expect(service.findAll).toHaveBeenCalledWith({
        tenantId,
        audience: "ALL",
        publishedOnly: false,
      });
      expect(res).toEqual(items);
    });

  });

  describe("findOne", () => {
    it("validates id and returns item", async () => {
      const item: Announcement = {
        id,
        tenantId,
        title: "t",
        body: "b",
        audience: "ALL",
        publishedAt: null,
      };
      service.findOne.mockResolvedValue(item);
      const res = await controller.findOne({ id } as unknown, tenantId);
      expect(service.findOne).toHaveBeenCalledWith(id, tenantId);
      expect(res).toEqual(item);
    });
  });

  describe("update", () => {
    it("parses body and calls service.update", async () => {
      const patch: UpdateAnnouncementBody = {
        title: "Updated",
        audience: "STAFF",
        publishedAt: "2025-01-12",
      };
      const updated: Announcement = {
        id,
        tenantId,
        title: "Updated",
        body: "b",
        audience: "STAFF",
        publishedAt: new Date("2025-01-12T00:00:00.000Z"),
      };
      service.update.mockResolvedValue(updated);

      const res = await controller.update(
        { id } as unknown,
        patch as unknown,
        tenantId,
        orgId,
      );
      expect(service.update).toHaveBeenCalledTimes(1);
      const [, argDto, argTenant] = service.update.mock.calls[0];
      expect((argDto as { audience?: Audience }).audience).toBe("STAFF");
      expect(
        (argDto as { publishedAt?: Date }).publishedAt instanceof Date,
      ).toBe(true);
      expect(argTenant).toBe(tenantId);
      expect(res).toEqual(updated);
    });
  });

  describe("remove", () => {
    it("validates id and calls service.remove", async () => {
      const deleted: { id: string } = { id };
      service.remove.mockResolvedValue(deleted);
      const res = await controller.remove({ id } as unknown, tenantId);
      expect(service.remove).toHaveBeenCalledWith(id, tenantId);
      expect(res).toEqual(deleted);
    });
  });

  it("blocks create when hard cap is hit", async () => {
    enforcement.checkAv30ForOrg.mockResolvedValue({
      status: "HARD_CAP",
      orgId,
      currentAv30: 130,
      av30Cap: 100,
      graceUntil: null,
      messageCode: "av30.hard_cap",
    });
    enforcement.assertWithinHardCap.mockImplementation(() => {
      throw new Av30HardCapExceededError(orgId);
    });

    await expect(
      controller.create(
        {
          tenantId,
          title: "Cap hit",
          body: "nope",
          audience: "ALL",
        } as unknown,
        tenantId,
        orgId,
      ),
    ).rejects.toBeInstanceOf(Av30HardCapExceededError);
    expect(service.create).not.toHaveBeenCalled();
  });
});
