import {
  AccessCacheService,
  MAX_ACCESS_CACHE_ENTRIES,
  MAX_ACCESS_CACHE_TTL_MS,
} from "../access-cache.service";

describe("AccessCacheService", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-07-29T12:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("reuses an effective-access snapshot for no longer than 60 seconds", async () => {
    const cache = new AccessCacheService();
    const load = jest.fn().mockResolvedValue({ marker: "first" });
    const key = { userId: "user-1", orgId: "org-1", tenantId: "site-1" };

    await expect(cache.getOrLoad(key, load)).resolves.toEqual({
      marker: "first",
    });
    await expect(cache.getOrLoad(key, load)).resolves.toEqual({
      marker: "first",
    });
    expect(load).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(MAX_ACCESS_CACHE_TTL_MS);
    load.mockResolvedValue({ marker: "second" });

    await expect(cache.getOrLoad(key, load)).resolves.toEqual({
      marker: "second",
    });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("invalidates every site variant for one user and organisation", async () => {
    const cache = new AccessCacheService();
    const organisationLoad = jest.fn().mockResolvedValue({ marker: "org" });
    const siteOneLoad = jest.fn().mockResolvedValue({ marker: "site-1" });
    const siteTwoLoad = jest.fn().mockResolvedValue({ marker: "site-2" });
    const otherOrgLoad = jest.fn().mockResolvedValue({ marker: "other-org" });

    await cache.getOrLoad(
      { userId: "user-1", orgId: "org-1" },
      organisationLoad,
    );
    await cache.getOrLoad(
      { userId: "user-1", orgId: "org-1", tenantId: "site-1" },
      siteOneLoad,
    );
    await cache.getOrLoad(
      { userId: "user-1", orgId: "org-1", tenantId: "site-2" },
      siteTwoLoad,
    );
    await cache.getOrLoad(
      { userId: "user-1", orgId: "org-2", tenantId: "site-3" },
      otherOrgLoad,
    );

    await cache.invalidateUser("user-1", "org-1");
    await cache.getOrLoad(
      { userId: "user-1", orgId: "org-1" },
      organisationLoad,
    );
    await cache.getOrLoad(
      { userId: "user-1", orgId: "org-1", tenantId: "site-1" },
      siteOneLoad,
    );
    await cache.getOrLoad(
      { userId: "user-1", orgId: "org-1", tenantId: "site-2" },
      siteTwoLoad,
    );
    await cache.getOrLoad(
      { userId: "user-1", orgId: "org-2", tenantId: "site-3" },
      otherOrgLoad,
    );

    expect(organisationLoad).toHaveBeenCalledTimes(2);
    expect(siteOneLoad).toHaveBeenCalledTimes(2);
    expect(siteTwoLoad).toHaveBeenCalledTimes(2);
    expect(otherOrgLoad).toHaveBeenCalledTimes(1);
  });

  it("expires a snapshot at its earliest assignment expiry", async () => {
    const cache = new AccessCacheService();
    const load = jest
      .fn()
      .mockResolvedValueOnce({ marker: "active" })
      .mockResolvedValueOnce({ marker: "expired" });
    const key = { userId: "user-1", orgId: "org-1" };

    await cache.getOrLoad(
      key,
      load,
      new Date("2026-07-29T12:00:05.000Z"),
    );
    jest.advanceTimersByTime(5_000);

    await expect(cache.getOrLoad(key, load)).resolves.toEqual({
      marker: "expired",
    });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not publish a stale in-flight load after user invalidation", async () => {
    const cache = new AccessCacheService();
    let resolveStaleLoad: ((value: { marker: string }) => void) | undefined;
    const staleLoad = new Promise<{ marker: string }>((resolve) => {
      resolveStaleLoad = resolve;
    });
    const key = { userId: "user-1", orgId: "org-1", tenantId: "site-1" };

    const inFlight = cache.getOrLoad(key, () => staleLoad);
    await cache.invalidateUser("user-1", "org-1");
    resolveStaleLoad?.({ marker: "stale" });

    await expect(inFlight).resolves.toEqual({ marker: "stale" });
    const freshLoad = jest.fn().mockResolvedValue({ marker: "fresh" });
    await expect(cache.getOrLoad(key, freshLoad)).resolves.toEqual({
      marker: "fresh",
    });
    expect(freshLoad).toHaveBeenCalledTimes(1);
  });

  it("evicts the oldest entry deterministically when the fixed cap is reached", async () => {
    const cache = new AccessCacheService();
    const loads = Array.from(
      { length: MAX_ACCESS_CACHE_ENTRIES + 1 },
      (_, index) => jest.fn().mockResolvedValue({ index }),
    );

    for (let index = 0; index < MAX_ACCESS_CACHE_ENTRIES + 1; index += 1) {
      await cache.getOrLoad(
        {
          userId: `user-${index}`,
          orgId: "org-1",
        },
        loads[index],
      );
    }

    await cache.getOrLoad(
      { userId: "user-0", orgId: "org-1" },
      loads[0],
    );
    await cache.getOrLoad(
      {
        userId: `user-${MAX_ACCESS_CACHE_ENTRIES}`,
        orgId: "org-1",
      },
      loads[MAX_ACCESS_CACHE_ENTRIES],
    );

    expect(loads[0]).toHaveBeenCalledTimes(2);
    expect(loads[MAX_ACCESS_CACHE_ENTRIES]).toHaveBeenCalledTimes(1);
  });

  it("prunes expired entries before applying the fixed cap", async () => {
    const cache = new AccessCacheService();
    const loads = Array.from(
      { length: MAX_ACCESS_CACHE_ENTRIES + 1 },
      (_, index) => jest.fn().mockResolvedValue({ index }),
    );

    await cache.getOrLoad(
      { userId: "expired-user", orgId: "org-1" },
      loads[0],
      new Date("2026-07-29T12:00:01.000Z"),
    );
    for (let index = 1; index < MAX_ACCESS_CACHE_ENTRIES; index += 1) {
      await cache.getOrLoad(
        { userId: `user-${index}`, orgId: "org-1" },
        loads[index],
      );
    }

    jest.advanceTimersByTime(1_000);
    await cache.getOrLoad(
      { userId: "new-user", orgId: "org-1" },
      loads[MAX_ACCESS_CACHE_ENTRIES],
    );
    await cache.getOrLoad(
      { userId: "user-1", orgId: "org-1" },
      loads[1],
    );

    expect(loads[1]).toHaveBeenCalledTimes(1);
    expect(loads[MAX_ACCESS_CACHE_ENTRIES]).toHaveBeenCalledTimes(1);
  });
});
