import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { Request } from "express";
import { StaffSchoolVolunteeringController } from "../school-volunteering.controller";
import type { SchoolVolunteeringService } from "../school-volunteering.service";

const siteId = "472cb449-c5b7-4d20-a4a4-132f15e17c41";
const otherSiteId = "97c60b2d-ac6a-4870-a754-4ad3fa7ddace";
const reservationId = "06d04136-4620-49a6-b97a-17a106fd8013";
const request = { authUserId: "staff-a", authIsSuperUser: false } as Request & {
  authUserId?: string;
  authIsSuperUser?: boolean;
};

function setup() {
  const service = {
    staffRota: jest.fn(),
    cancelByManager: jest.fn(),
  } as unknown as SchoolVolunteeringService;
  return {
    service,
    controller: new StaffSchoolVolunteeringController(service),
  };
}

describe("staff school volunteering routes", () => {
  it("rejects a site switch mismatch before reading or cancelling", () => {
    const { service, controller } = setup();
    expect(() =>
      controller.list(
        otherSiteId,
        { from: "2027-10-12", to: "2027-10-18" },
        siteId,
        "org-a",
        request,
      ),
    ).toThrow(NotFoundException);
    expect(() =>
      controller.cancel(
        otherSiteId,
        reservationId,
        { reason: "Changed plans" },
        siteId,
        "org-a",
        request,
      ),
    ).toThrow(NotFoundException);
    expect(service.staffRota).not.toHaveBeenCalled();
    expect(service.cancelByManager).not.toHaveBeenCalled();
  });

  it("rejects an unbounded rota range and an unreasoned cancellation", () => {
    const { controller } = setup();
    expect(() =>
      controller.list(
        siteId,
        { from: "2027-10-01", to: "2027-12-01" },
        siteId,
        "org-a",
        request,
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      controller.cancel(
        siteId,
        reservationId,
        { reason: "" },
        siteId,
        "org-a",
        request,
      ),
    ).toThrow(BadRequestException);
  });
});
