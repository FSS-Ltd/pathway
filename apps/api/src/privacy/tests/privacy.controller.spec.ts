import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { PrivacyController } from "../privacy.controller";
import { PrivacyService } from "../privacy.service";
import { AuthUserGuard } from "../../auth/auth-user.guard";

describe("PrivacyController", () => {
  let controller: PrivacyController;
  let service: PrivacyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PrivacyController],
      providers: [
        {
          provide: PrivacyService,
          useValue: {
            listExports: jest.fn(),
            requestExport: jest.fn(),
            getExportFile: jest.fn(),
            requestDeletion: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(AuthUserGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(PrivacyController);
    service = module.get(PrivacyService);
  });

  it("listExports() forwards the caller's own tenantId to the service", async () => {
    const spy = jest.spyOn(service, "listExports").mockResolvedValue([]);

    await controller.listExports("tenant-a");

    expect(spy).toHaveBeenCalledWith("tenant-a");
  });

  it("requestExport() validates the kind and forwards to the service", async () => {
    const spy = jest
      .spyOn(service, "requestExport")
      .mockResolvedValue({ id: "exp1", status: "READY" } as never);

    const result = await controller.requestExport({ kind: "FAMILY_DATA" }, "tenant-a", "user-a");

    expect(spy).toHaveBeenCalledWith("FAMILY_DATA", "tenant-a", "user-a");
    expect((result as { id: string }).id).toBe("exp1");
  });

  it("requestExport() rejects an invalid kind", () => {
    expect(() => controller.requestExport({ kind: "NOT_A_KIND" }, "tenant-a", "user-a")).toThrow(
      BadRequestException,
    );
  });

  it("downloadExport() streams the buffer with the right headers", async () => {
    jest.spyOn(service, "getExportFile").mockResolvedValue({
      buffer: Buffer.from("PK\x03\x04"),
      contentType: "application/zip",
      fileName: "exp1.zip",
    });
    const response = {
      setHeader: jest.fn(),
      send: jest.fn(),
    } as unknown as import("express").Response;

    await controller.downloadExport("11111111-1111-1111-1111-111111111111", "tenant-a", response);

    expect(response.setHeader).toHaveBeenCalledWith("Content-Type", "application/zip");
    expect(response.setHeader).toHaveBeenCalledWith(
      "Content-Disposition",
      'attachment; filename="exp1.zip"',
    );
    expect(response.send).toHaveBeenCalled();
  });

  // Cross-tenant negative authorization: a request for another household's
  // export (service returns null because it isn't in the caller's own
  // tenant - see privacy.service.spec.ts) must 404, not leak whether the
  // export exists.
  it("downloadExport() 404s when the export isn't found in the caller's tenant", async () => {
    jest.spyOn(service, "getExportFile").mockResolvedValue(null);
    const response = { setHeader: jest.fn(), send: jest.fn() } as unknown as import("express").Response;

    await expect(
      controller.downloadExport("11111111-1111-1111-1111-111111111111", "tenant-b", response),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("downloadExport() rejects a non-uuid id", async () => {
    const response = { setHeader: jest.fn(), send: jest.fn() } as unknown as import("express").Response;

    await expect(controller.downloadExport("not-a-uuid", "tenant-a", response)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("requestDeletion() forwards the reason, orgId and caller identity to the service", async () => {
    const spy = jest
      .spyOn(service, "requestDeletion")
      .mockResolvedValue({ id: "del1", status: "SUBMITTED" } as never);

    await controller.requestDeletion(
      { reason: "Moving away" },
      "tenant-a",
      "org-a",
      "user-a",
      "parent@example.com",
      "Parent Name",
    );

    expect(spy).toHaveBeenCalledWith(
      { reason: "Moving away" },
      "tenant-a",
      "org-a",
      "user-a",
      "parent@example.com",
      "Parent Name",
    );
  });

  // Negative authorization: the admin gate itself lives in
  // PrivacyService.assertSiteOrOrgAdmin (see privacy.service.spec.ts's
  // "rejects a caller who is not a site or org admin") - this confirms the
  // controller doesn't swallow that rejection and still returns it as the
  // response to the caller.
  it("requestDeletion() propagates a permission-denied rejection from the service", async () => {
    const { ForbiddenException } = await import("@nestjs/common");
    jest
      .spyOn(service, "requestDeletion")
      .mockRejectedValue(new ForbiddenException("Only admins can request deletion of this family account"));

    await expect(
      controller.requestDeletion({}, "tenant-a", "org-a", "user-a", undefined, undefined),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
