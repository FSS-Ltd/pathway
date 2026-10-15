import { Test } from "@nestjs/testing";
import { prisma, type Prisma } from "@pathway/db";
import type { PermissionKey } from "@pathway/platform";
import { EffectivePermissionsService } from "../access-control/effective-permissions.service";
import * as accessModule from "./tracker-access";
import { TrackerSignalsService } from "./tracker-signals.service";
import { TRACKER_SIGNAL_READERS } from "./tracker-signal-readers";
import type { ComplianceActor } from "./compliance.service";
const actor: ComplianceActor = {
  tenantId: "site",
  orgId: "org",
  userId: "user",
};
describe("Tracker signal permissions and availability", () => {
  let service: TrackerSignalsService;
  let permissions: PermissionKey[];
  let failAccess: boolean;
  const readSpies = () =>
    TRACKER_SIGNAL_READERS.map((reader) =>
      jest.spyOn(reader, "read").mockResolvedValue({
        count: 3,
        missingCount: 1,
        description: "Recorded evidence",
        href: "/permitted",
      }),
    );
  beforeEach(async () => {
    permissions = [];
    failAccess = false;
    jest.spyOn(accessModule, "auditTracker").mockResolvedValue();
    const module = await Test.createTestingModule({
      providers: [
        TrackerSignalsService,
        {
          provide: accessModule.TrackerAccessService,
          useValue: {
            run: async (
              _actor: ComplianceActor,
              _access: string,
              operation: (tx: Prisma.TransactionClient) => Promise<unknown>,
            ) => {
              if (failAccess) throw new Error("Tracker access denied");
              // No database query is executed: each observation and audit is replaced below.
              return operation(prisma);
            },
          },
        },
        {
          provide: EffectivePermissionsService,
          useValue: {
            listForUserWithSourcesInTransaction: async () =>
              permissions.map((permissionKey) => ({
                permissionKey,
                sourceRoleIds: [],
              })),
          },
        },
      ],
    }).compile();
    service = module.get(TrackerSignalsService);
  });
  afterEach(() => jest.restoreAllMocks());
  it("returns unknown without querying restricted records or disclosing links", async () => {
    const spies = readSpies();
    const result = await service.read(actor);
    expect(result).toHaveLength(7);
    expect(
      result.every(
        (value) =>
          value.status === "UNKNOWN" &&
          value.count === null &&
          value.missingCount === null &&
          value.href === null,
      ),
    ).toBe(true);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
  it("requires every underlying permission, preserves known zero and isolates unavailable readers", async () => {
    const spies = readSpies();
    permissions = [
      ...new Set(
        TRACKER_SIGNAL_READERS.flatMap((reader) => [...reader.permissions]),
      ),
    ];
    spies[0].mockResolvedValue({
      count: 0,
      missingCount: 0,
      description: "No records",
      href: "/compliance/checks",
    });
    spies[1].mockRejectedValue(new Error("Unavailable database relation"));
    permissions = permissions.filter(
      (key) => key !== "school.permission_slips.manage",
    );
    const result = await service.read(actor);
    expect(result.find((row) => row.key === "personnel")).toMatchObject({
      status: "KNOWN",
      count: 0,
    });
    expect(result.find((row) => row.key === "agreements")).toMatchObject({
      status: "UNKNOWN",
      count: null,
      href: null,
    });
    expect(result.find((row) => row.key === "trips")).toMatchObject({
      status: "UNKNOWN",
      count: null,
      href: null,
    });
    expect(result.find((row) => row.key === "medical")).toMatchObject({
      status: "KNOWN",
      count: 3,
    });
    expect(spies[5]).not.toHaveBeenCalled();
  });
  it("refuses the whole endpoint when tracker access fails", async () => {
    const spies = readSpies();
    failAccess = true;
    await expect(service.read(actor)).rejects.toThrow("Tracker access denied");
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
