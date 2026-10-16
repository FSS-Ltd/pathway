import {
  ExpireAddonTrialsJob,
  type AddonTrialExpiryDispatcher,
  type ExpiredAddonTrialOrgStore,
} from "../expire-addon-trials.job";
import { HttpAddonTrialExpiryDispatcher } from "../http-addon-trial-expiry.dispatcher";

describe("ExpireAddonTrialsJob", () => {
  it("dispatches one expiry operation per due organisation", async () => {
    const store: ExpiredAddonTrialOrgStore = {
      findOrgIds: jest.fn().mockResolvedValue(["org-1", "org-2"]),
    };
    const dispatcher: jest.Mocked<AddonTrialExpiryDispatcher> = {
      expireForOrg: jest.fn().mockResolvedValue(undefined),
    };
    const now = new Date("2030-01-01T00:00:00.000Z");

    await expect(
      new ExpireAddonTrialsJob(dispatcher, store).run(now),
    ).resolves.toEqual({
      organisations: 2,
      failed: 0,
    });
    expect(store.findOrgIds).toHaveBeenCalledWith(now);
    expect(dispatcher.expireForOrg).toHaveBeenNthCalledWith(1, "org-1");
    expect(dispatcher.expireForOrg).toHaveBeenNthCalledWith(2, "org-2");
  });

  it("continues after a per-organisation failure so the next run can retry", async () => {
    const store: ExpiredAddonTrialOrgStore = {
      findOrgIds: jest.fn().mockResolvedValue(["org-1", "org-2"]),
    };
    const dispatcher: jest.Mocked<AddonTrialExpiryDispatcher> = {
      expireForOrg: jest
        .fn()
        .mockRejectedValueOnce(new Error("api unavailable"))
        .mockResolvedValueOnce(undefined),
    };

    await expect(
      new ExpireAddonTrialsJob(dispatcher, store).run(),
    ).resolves.toEqual({
      organisations: 2,
      failed: 1,
    });
    expect(dispatcher.expireForOrg).toHaveBeenCalledTimes(2);
  });
});

describe("HttpAddonTrialExpiryDispatcher", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as typeof fetch;
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
  });

  it("calls the authenticated internal expiry endpoint", async () => {
    const dispatcher = new HttpAddonTrialExpiryDispatcher(
      new URL("https://api.example.test"),
      "internal-secret",
    );

    await dispatcher.expireForOrg("org-1");

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://api.example.test/billing/institutional/internal/addons/expire",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-pathway-internal-secret": "internal-secret",
      },
      body: JSON.stringify({ orgId: "org-1" }),
    });
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });
});
