import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { PlanPreviewController } from "../plan-preview.controller";
import { PlanPreviewService } from "../plan-preview.service";
import type {
  PlanPreviewRequest,
  PlanPreviewResponse,
} from "../plan-preview.types";

describe("PlanPreviewController", () => {
  let controller: PlanPreviewController;
  const previewMock = jest.fn();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlanPreviewController],
      providers: [{ provide: PlanPreviewService, useValue: { preview: previewMock } }],
    })
      .compile();

    controller = module.get(PlanPreviewController);
    previewMock.mockReset();
  });

  it("delegates to service with trimmed plan code", () => {
    const response: PlanPreviewResponse = {
      planCode: "STARTER_MONTHLY",
      planTier: "starter",
      displayName: "Starter",
      billingPeriod: "monthly",
      selfServe: true,
      base: {
        av30Cap: 50,
        maxChildren: null,
        storageGbCap: null,
        smsMessagesCap: null,
        leaderSeatsIncluded: null,
        maxSites: 1,
      },
      addons: {
        av30Cap: null,
        maxChildren: null,
        storageGbCap: null,
        smsMessagesCap: null,
        leaderSeatsIncluded: null,
        maxSites: null,
        extraAv30Blocks: null,
      },
      effectiveCaps: {
        av30Cap: 50,
        maxChildren: null,
        storageGbCap: null,
        smsMessagesCap: null,
        leaderSeatsIncluded: null,
        maxSites: 1,
      },
      notes: { source: "plan_catalogue", warnings: [] },
    };
    previewMock.mockReturnValue(response);

    const body: PlanPreviewRequest = {
      planCode: " STARTER_MONTHLY ",
      addons: { extraAv30Blocks: 1 },
    };
    const result = controller.preview(body);

    expect(previewMock).toHaveBeenCalledWith({
      planCode: "STARTER_MONTHLY",
      addons: body.addons,
    });
    expect(result).toBe(response);
  });

  it("throws on missing planCode", () => {
    expect(() => controller.preview({} as unknown as PlanPreviewRequest)).toThrow(
      BadRequestException,
    );
  });

  it("throws on non-numeric add-on fields", () => {
    expect(() =>
      controller.preview({
        planCode: "GROWTH_MONTHLY",
        addons: { extraAv30Blocks: "2" as unknown as number },
      }),
    ).toThrow(BadRequestException);
  });
});
