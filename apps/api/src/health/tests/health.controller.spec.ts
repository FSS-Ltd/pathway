const queryRawUnsafe = jest.fn();

jest.mock("@pathway/db", () => ({
  prisma: { $queryRawUnsafe: (...args: unknown[]) => queryRawUnsafe(...args) },
}));

import { APP_VERSION } from "@pathway/util";
import { HealthController } from "../health.controller";

describe("HealthController", () => {
  beforeEach(() => {
    queryRawUnsafe.mockReset();
  });

  it("returns status, dbTime, and the app version", async () => {
    queryRawUnsafe.mockResolvedValue([{ now: "2026-07-17T00:00:00.000Z" }]);
    const controller = new HealthController();

    const result = await controller.ok();

    expect(result).toEqual({
      status: "ok",
      dbTime: "2026-07-17T00:00:00.000Z",
      version: APP_VERSION,
    });
  });

  it("falls back to a null dbTime when the query returns no rows", async () => {
    queryRawUnsafe.mockResolvedValue([]);
    const controller = new HealthController();

    const result = await controller.ok();

    expect(result.dbTime).toBeNull();
    expect(result.version).toBe(APP_VERSION);
  });
});
