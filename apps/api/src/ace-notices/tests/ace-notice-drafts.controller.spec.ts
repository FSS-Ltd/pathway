import "reflect-metadata";
import { BadRequestException } from "@nestjs/common";
import { REQUIRED_PERMISSION } from "../../access-control/require-permission.decorator";
import { AceNoticeDraftsController } from "../ace-notice-drafts.controller";
import { AceNoticeDraftsService } from "../ace-notice-drafts.service";

const actor = { tenantId: "site-a", orgId: "org-a", userId: "user-a" };
const id = "b83e62d5-2050-485c-a657-bd83be0ee791";

function createController() {
  const service = {
    create: jest.fn(),
    list: jest.fn(),
    get: jest.fn(),
    update: jest.fn(),
  };
  const context = {
    requireContext: () => ({
      tenant: { tenantId: actor.tenantId },
      org: { orgId: actor.orgId },
      user: { userId: actor.userId },
    }),
  };
  return {
    controller: new AceNoticeDraftsController(
      service as unknown as AceNoticeDraftsService,
      context as never,
    ),
    service,
  };
}

describe("AceNoticeDraftsController", () => {
  it("requires notices.manage on every draft route", () => {
    for (const method of ["create", "list", "get", "update"] as const) {
      expect(
        Reflect.getMetadata(
          REQUIRED_PERMISSION,
          AceNoticeDraftsController.prototype[method],
        ),
      ).toBe("notices.manage");
    }
  });

  it("validates and bounds list input before using the trusted actor", () => {
    const { controller, service } = createController();
    controller.list({ limit: "10", cursor: id });
    expect(service.list).toHaveBeenCalledWith({ limit: 10, cursor: id }, actor);
    expect(() => controller.list({ limit: "51" })).toThrow(BadRequestException);
    expect(() => controller.list({ tenantId: "site-b" })).toThrow(
      BadRequestException,
    );
  });

  it("rejects invalid content, IDs, and revision before calling the service", () => {
    const { controller, service } = createController();
    expect(() =>
      controller.create({
        title: "",
        body: "Text",
        audience: "STAFF",
        expiresAt: null,
      }),
    ).toThrow(BadRequestException);
    expect(() => controller.get("wrong-id")).toThrow(BadRequestException);
    expect(() =>
      controller.update(id, {
        title: "News",
        body: "Text",
        audience: "STAFF",
        expiresAt: null,
        expectedUpdatedAt: "not-a-date",
      }),
    ).toThrow(BadRequestException);
    expect(service.create).not.toHaveBeenCalled();
    expect(service.get).not.toHaveBeenCalled();
    expect(service.update).not.toHaveBeenCalled();
  });
});
