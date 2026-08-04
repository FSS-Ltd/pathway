import { Test, TestingModule } from "@nestjs/testing";
import { DsarController } from "../dsar.controller";
import { DsarService } from "../dsar.service";
import { AuthUserGuard } from "../../auth/auth-user.guard";
import { SafeguardingGuard } from "../../common/safeguarding/safeguarding.guard";

describe("DsarController", () => {
  let controller: DsarController;
  const tenantId = "tenant-1";
  const childId = "11111111-1111-1111-1111-111111111111";

  const serviceMock: jest.Mocked<Pick<DsarService, "exportChild">> = {
    exportChild: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DsarController],
      providers: [{ provide: DsarService, useValue: serviceMock }],
    })
      .overrideGuard(AuthUserGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(SafeguardingGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(DsarController);
  });

  it("calls service with childId and tenantId", async () => {
    const exportData = {
      child: { id: childId, firstName: "Amy", lastName: "Jones", allergies: null, disabilities: [], notes: null, group: null },
      parents: [],
      attendance: [],
      notes: [],
      concerns: [],
      sessions: [],
    };
    serviceMock.exportChild.mockResolvedValue(exportData);

    const result = await controller.exportChild({ childId }, tenantId);

    expect(serviceMock.exportChild).toHaveBeenCalledWith(childId, tenantId);
    expect(result).toBe(exportData);
  });
});

