import {
  createMessageRealtimeConnection,
  type MessageRealtimeObserver,
} from "../message-realtime-connection";
import type { MessageRealtimeSubscription } from "../realtime-events";

function fixture(initialGrantError?: unknown, expiresAt?: string) {
  let renewAuth: () => Promise<void> = async () => {};
  let grantError = initialGrantError;
  let topic = "private-conversation";
  let denials = 0;
  const statuses: string[] = [];
  const observers: MessageRealtimeObserver[] = [];
  let dataReads = 0;
  let joins = 0;
  let authUpdates = 0;
  const authTokens: string[] = [];
  let closes = 0;
  let grants = 0;
  let refresh: (signal: AbortSignal) => Promise<void> = async () => {
    dataReads += 1;
  };
  const connection = createMessageRealtimeConnection({
    issueSubscription: async (): Promise<MessageRealtimeSubscription> => {
      grants += 1;
      if (grantError !== undefined) throw grantError;
      return {
        token: `token-${grants}`,
        topic,
        url: "https://project.supabase.co",
        publishableKey: "publishable",
        private: true,
        expiresAt: expiresAt ?? new Date(Date.now() + 120_000).toISOString(),
        authoritativeSource: "rest",
        refetchOn: ["reconnect", "event_loss"],
      };
    },
    openTransport: async (_subscription, observer) => {
      observers.push(observer);
      joins += 1;
      return {
        setAuth: async (token: string) => {
          authTokens.push(token);
          authUpdates += 1;
          await renewAuth();
        },
        close: () => {
          closes += 1;
        },
      };
    },
    onStatus: (status) => {
      statuses.push(status);
    },
    onInvalidate: (signal) => refresh(signal),
    isAccessDenied: (error) =>
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      error.status === 403,
    onAccessDenied: () => {
      denials += 1;
    },
    onRefreshError: jest.fn(),
  });
  function currentObserver(): MessageRealtimeObserver {
    const current = observers.at(-1);
    if (!current) throw new Error("Subscription has not opened");
    return current;
  }
  return {
    connection,
    statuses,
    authTokens,
    currentObserver,
    counts: () => ({ dataReads, joins, authUpdates, closes, grants }),
    denials: () => denials,
    setRenewAuth: (handler: typeof renewAuth) => {
      renewAuth = handler;
    },
    setGrantError: (error: unknown) => {
      grantError = error;
    },
    changeTopic: (value: string) => {
      topic = value;
    },
    setRefresh: (handler: typeof refresh) => {
      refresh = handler;
    },
  };
}

async function settle(): Promise<void> {
  for (let tick = 0; tick < 8; tick += 1) await Promise.resolve();
}

describe("message realtime connection", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-10-23T10:00:00Z"));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("waits for subscription readiness before the initial authoritative read", async () => {
    const driver = fixture();
    await settle();
    driver.connection.foreground();
    await settle();
    expect(driver.counts().dataReads).toBe(0);
    driver.currentObserver().onState("connected");
    await settle();
    expect(driver.counts().dataReads).toBe(1);
    driver.connection.stop();
  });

  it("holds early notifications until subscription readiness", async () => {
    const driver = fixture();
    await settle();
    driver.currentObserver().onEvent({ notificationId: "before-join" });
    await settle();
    expect(driver.counts().dataReads).toBe(0);
    driver.currentObserver().onState("connected");
    await settle();
    expect(driver.counts().dataReads).toBe(1);
    driver.connection.stop();
  });

  it("renews authentication three times without reading data or recreating its channel", async () => {
    const driver = fixture();
    await settle();
    driver.currentObserver().onState("connected");
    await settle();
    await jest.advanceTimersByTimeAsync(270_000);
    expect(driver.counts()).toEqual({
      dataReads: 1,
      joins: 1,
      authUpdates: 3,
      closes: 0,
      grants: 4,
    });
    expect(driver.authTokens).toEqual(["token-2", "token-3", "token-4"]);
    driver.connection.stop();
    expect(jest.getTimerCount()).toBe(0);
  });

  it("coalesces events during a read into one follow-up and ignores duplicate notifications", async () => {
    const driver = fixture();
    let reads = 0;
    let finish: (() => void) | undefined;
    driver.setRefresh(async () => {
      reads += 1;
      if (reads === 1)
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
    });
    await settle();
    const observer = driver.currentObserver();
    observer.onState("connected");
    await settle();
    observer.onEvent({ notificationId: "event-1" });
    observer.onEvent({ notificationId: "event-2" });
    observer.onEvent({ notificationId: "event-1" });
    await settle();
    expect(reads).toBe(1);
    if (!finish) throw new Error("Initial read did not start");
    finish();
    await settle();
    expect(reads).toBe(2);
    observer.onEvent({ notificationId: "event-2" });
    await settle();
    expect(reads).toBe(2);
    driver.connection.stop();
  });

  it("does not refresh during connection failures and catches up once after reconnect", async () => {
    const driver = fixture();
    await settle();
    const observer = driver.currentObserver();
    observer.onState("connected");
    await settle();
    observer.onState("disconnected");
    observer.onState("disconnected");
    await jest.advanceTimersByTimeAsync(60_000);
    expect(driver.counts().dataReads).toBe(1);
    observer.onState("connected");
    await settle();
    expect(driver.counts().dataReads).toBe(1);
    driver.currentObserver().onState("connected");
    driver.currentObserver().onState("connected");
    await settle();
    expect(driver.counts().dataReads).toBe(2);
    driver.connection.stop();
  });
  it("loads an explicitly opened conversation once when subscription setup fails, without outage polling", async () => {
    const driver = fixture(new Error("offline"));
    await settle();
    expect(driver.counts().dataReads).toBe(1);
    await jest.advanceTimersByTimeAsync(60_000);
    expect(driver.counts().dataReads).toBe(1);
    driver.setGrantError(undefined);
    await jest.advanceTimersByTimeAsync(1_000);
    driver.currentObserver().onState("connected");
    await settle();
    expect(driver.counts().dataReads).toBe(2);
    driver.connection.stop();
  });

  it("stops and reports access revocation without retrying grants or reading history", async () => {
    const driver = fixture();
    await settle();
    driver.currentObserver().onState("connected");
    await settle();
    driver.setGrantError({ status: 403 });
    await jest.advanceTimersByTimeAsync(300_000);
    expect(driver.denials()).toBe(1);
    expect(driver.counts()).toEqual({
      dataReads: 1,
      joins: 1,
      authUpdates: 0,
      closes: 1,
      grants: 2,
    });
    expect(jest.getTimerCount()).toBe(0);
  });

  it("leaves the previous topic before joining a changed grant scope", async () => {
    const driver = fixture();
    await settle();
    const previous = driver.currentObserver();
    previous.onState("connected");
    await settle();
    driver.changeTopic("another-private-topic");
    await jest.advanceTimersByTimeAsync(90_000);
    expect(driver.counts()).toEqual({
      dataReads: 1,
      joins: 2,
      authUpdates: 0,
      closes: 1,
      grants: 2,
    });
    expect(driver.statuses.at(-1)).toBe("connecting");
    previous.onEvent({ notificationId: "old-scope-event" });
    await settle();
    expect(driver.counts().dataReads).toBe(1);
    driver.currentObserver().onState("connected");
    await settle();
    expect(driver.counts().dataReads).toBe(2);
    driver.connection.stop();
  });

  it("reconnects even when an obsolete authentication update has not settled", async () => {
    const driver = fixture();
    await settle();
    driver.currentObserver().onState("connected");
    await settle();
    let finish: (() => void) | undefined;
    driver.setRenewAuth(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    await jest.advanceTimersByTimeAsync(90_000);
    driver.currentObserver().onState("disconnected");
    await jest.advanceTimersByTimeAsync(1_000);
    expect(driver.counts().joins).toBe(2);
    if (!finish) throw new Error("Authentication renewal did not start");
    finish();
    await settle();
    expect(driver.counts().joins).toBe(2);
    driver.currentObserver().onState("connected");
    await settle();
    expect(driver.counts().dataReads).toBe(2);
    driver.connection.stop();
  });

  it("aborts an outstanding read and ignores callbacks after stop", async () => {
    const driver = fixture();
    await settle();
    let readSignal: AbortSignal | undefined;
    let finishRead: (() => void) | undefined;
    let readCalls = 0;
    driver.setRefresh((signal) => {
      readCalls += 1;
      readSignal = signal;
      return new Promise<void>((resolve) => {
        finishRead = resolve;
      });
    });
    const previous = driver.currentObserver();
    previous.onState("connected");
    await settle();
    driver.connection.stop();
    expect(readSignal?.aborted).toBe(true);
    previous.onEvent({ notificationId: "late-event" });
    previous.onState("connected");
    finishRead?.();
    await jest.advanceTimersByTimeAsync(300_000);
    expect(driver.counts()).toMatchObject({ grants: 1, closes: 1, joins: 1 });
    expect(readCalls).toBe(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("ignores a grant that settles after cleanup", async () => {
    const driver = fixture();
    driver.connection.stop();
    await settle();
    expect(driver.counts()).toEqual({
      grants: 1,
      closes: 0,
      joins: 0,
      dataReads: 0,
      authUpdates: 0,
    });
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each(["invalid-date", "2020-01-01T00:00:00Z"])(
    "rejects an unusable grant expiry without creating a channel: %s",
    async (expiresAt) => {
      const driver = fixture(undefined, expiresAt);
      await settle();
      expect(driver.counts().joins).toBe(0);
      await jest.advanceTimersByTimeAsync(999);
      expect(driver.counts().grants).toBe(1);
      driver.connection.stop();
    },
  );
});
