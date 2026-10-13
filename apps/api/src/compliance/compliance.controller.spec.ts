import "reflect-metadata";
import { BadRequestException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PathwayRequestContext } from "@pathway/auth";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { PermissionGuard } from "../access-control/permission.guard";
import { REQUIRED_PERMISSION } from "../access-control/require-permission.decorator";
import { ComplianceController } from "./compliance.controller";
import { ComplianceService } from "./compliance.service";

const actor = {
  tenantId: "00000000-0000-4000-8000-000000000001",
  orgId: "00000000-0000-4000-8000-000000000002",
  userId: "00000000-0000-4000-8000-000000000003",
};
const recordId = "00000000-0000-4000-8000-000000000004";
const input = {
  subjectName: "Test colleague",
  subjectUserId: null,
  roleDescription: "Tutor",
  kind: "FIRST_AID",
  scheme: null,
  title: "First aid training",
  provider: null,
  reference: null,
  completedOn: "2025-01-15",
  reviewDueOn: null,
  status: "RECORDED",
  notes: null,
  verificationNotes: null,
};

describe("ComplianceController", () => {
  const service = {
    list: jest.fn(),
    create: jest.fn(),
    get: jest.fn(),
    update: jest.fn(),
    archive: jest.fn(),
    history: jest.fn(),
    people: jest.fn(),
    exportRecord: jest.fn(),
  };
  let controller: ComplianceController;
  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        ComplianceController,
        { provide: ComplianceService, useValue: service },
        {
          provide: PathwayRequestContext,
          useValue: {
            requireContext: () => ({
              tenant: { tenantId: actor.tenantId },
              org: { orgId: actor.orgId },
              user: { userId: actor.userId },
            }),
          },
        },
      ],
    })
      .overrideGuard(AuthUserGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(ComplianceController);
  });
  it("resolves actor and site exclusively from authenticated context", () => {
    controller.create(input);
    expect(service.create).toHaveBeenCalledWith(input, actor);
    expect(() =>
      controller.create({ ...input, tenantId: "another-site" }),
    ).toThrow(BadRequestException);
    expect(service.create).toHaveBeenCalledTimes(1);
  });
  it("requires mutation permission on every modifying route and person lookup", () => {
    for (const method of [
      "create",
      "update",
      "archive",
      "people",
      "exportRecord",
    ] as const) {
      expect(
        Reflect.getMetadata(
          REQUIRED_PERMISSION,
          ComplianceController.prototype[method],
        ),
      ).toBe("compliance.checks.manage");
    }
    for (const method of ["list", "get", "history"] as const) {
      expect(
        Reflect.getMetadata(
          REQUIRED_PERMISSION,
          ComplianceController.prototype[method],
        ),
      ).toBe("compliance.checks.read");
    }
  });
  it("separates the expected version from editable data", () => {
    controller.update(recordId, { ...input, expectedVersion: 4 });
    expect(service.update).toHaveBeenCalledWith(recordId, input, 4, actor);
    expect(() => controller.update(recordId, input)).toThrow(
      BadRequestException,
    );
  });
  it("validates record identifiers, cursors and archive body before invoking service", () => {
    expect(() => controller.get("not-an-id")).toThrow(BadRequestException);
    expect(() => controller.history(recordId, { cursor: "not-an-id" })).toThrow(
      BadRequestException,
    );
    expect(() =>
      controller.archive(recordId, {
        expectedVersion: 1,
        tenantId: actor.tenantId,
      }),
    ).toThrow(BadRequestException);
    expect(service.get).not.toHaveBeenCalled();
    expect(service.history).not.toHaveBeenCalled();
    expect(service.archive).not.toHaveBeenCalled();
  });
  it("handles explicit false and bounded people queries", () => {
    controller.list({ includeArchived: "false" });
    expect(service.list).toHaveBeenCalledWith(
      { includeArchived: false },
      actor,
    );
    controller.people({ query: " Tutor " });
    expect(service.people).toHaveBeenCalledWith("Tutor", actor);
    expect(() => controller.people({ query: "x".repeat(101) })).toThrow(
      BadRequestException,
    );
  });
});
