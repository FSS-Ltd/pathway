import { EventEmitter } from "node:events";
import { PostgresFinanceWebhookSubscription } from "../postgres-finance-webhook-subscription";

const connection = "postgresql://listener:synthetic@127.0.0.1:54717/disposable";

class FakeClient extends EventEmitter {
  connect = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
  end = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
  query = jest
    .fn<Promise<{ rows: unknown[] }>, [string, unknown[]?]>()
    .mockImplementation(async (sql) => ({
      rows: sql.includes("pg_roles")
        ? [{ rolsuper: false, rolbypassrls: false }]
        : [{ scopes: [], nextWakeAt: null }],
    }));
}

function setup() {
  const client = new FakeClient();
  const factory = jest.fn(() => ({
    connect: () => client.connect(),
    query: (sql: string, values?: unknown[]) =>
      values ? client.query(sql, values) : client.query(sql),
    end: () => client.end(),
    on: (event: string, callback: (...values: unknown[]) => void) => {
      client.on(event, callback);
    },
    removeListener: (
      event: string,
      callback: (...values: unknown[]) => void,
    ) => {
      client.removeListener(event, callback);
    },
  }));
  const source = new PostgresFinanceWebhookSubscription(
    connection,
    false,
    factory,
  );
  const wake = jest.fn();
  const disconnected = jest.fn();
  return { client, factory, source, wake, disconnected };
}

describe("dedicated PostgreSQL Finance subscription", () => {
  it("uses an explicit session URL, bounded timeouts and TCP keepalive", async () => {
    const f = setup();
    await f.source.start(f.wake, f.disconnected);
    expect(f.factory).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionString: connection,
        connectionTimeoutMillis: 5000,
        query_timeout: 5000,
        keepAlive: true,
      }),
    );
    expect(f.client.query).toHaveBeenLastCalledWith(
      "LISTEN finance_webhook_work",
    );
    await f.source.close();
  });

  it.each([
    "",
    "https://listener:synthetic@example.test/database",
    "postgresql://listener:synthetic@example.test:6543/database",
    "postgresql://listener:synthetic@example.test/database?pgbouncer=true",
    "postgresql://listener:synthetic@example.test/database?sslmode=disable",
    "postgresql://example.test/database",
    `${connection}?host=remote.example`,
    `${connection}?port=6543`,
    `${connection}?query_timeout=0&statement_timeout=0`,
  ])(
    "rejects an absent or incompatible listener URL without connecting: %s",
    (url) => {
      const factory = jest.fn();
      expect(
        () => new PostgresFinanceWebhookSubscription(url, false, factory),
      ).toThrow();
      expect(factory).not.toHaveBeenCalled();
    },
  );

  it("requires certificate verification on nonlocal connections", async () => {
    const f = setup();
    const source = new PostgresFinanceWebhookSubscription(
      "postgresql://listener:synthetic@example.test/database?sslmode=require",
      false,
      f.factory,
    );
    await source.start(f.wake, f.disconnected);
    expect(f.factory).toHaveBeenCalledWith(
      expect.objectContaining({ ssl: { rejectUnauthorized: true } }),
    );
    await source.close();
  });

  it.each(["rolsuper", "rolbypassrls"])(
    "rejects an administrative %s role",
    async (privilege) => {
      const f = setup();
      f.client.query.mockResolvedValueOnce({
        rows: [{ rolsuper: false, rolbypassrls: false, [privilege]: true }],
      });
      await expect(
        f.source.start(f.wake, f.disconnected),
      ).rejects.toMatchObject({
        reason: "PERMISSION",
      });
      expect(f.client.query).not.toHaveBeenCalledWith(
        "LISTEN finance_webhook_work",
      );
      await f.source.close();
    },
  );

  it("accepts only empty hints on its own notification channel", async () => {
    const f = setup();
    await f.source.start(f.wake, f.disconnected);
    f.client.emit("notification", { channel: "other", payload: "" });
    f.client.emit("notification", {
      channel: "finance_webhook_work",
      payload: "untrusted",
    });
    f.client.emit("notification", {
      channel: "finance_webhook_work",
      payload: "",
    });
    expect(f.wake).toHaveBeenCalledTimes(1);
    await f.source.close();
  });

  it("loads the mode-scoped plan with parameters and retains a future-only deadline", async () => {
    const f = setup();
    await f.source.start(f.wake, f.disconnected);
    const at = new Date("2026-10-23T21:30:00Z");
    f.client.query.mockResolvedValueOnce({
      rows: [{ scopes: [], nextWakeAt: at }],
    });
    await expect(
      f.source.readPlan(new Date("2026-10-23T21:00:00Z")),
    ).resolves.toEqual({
      scopes: [],
      nextWakeAt: at,
    });
    expect(f.client.query).toHaveBeenLastCalledWith(
      expect.stringContaining("app.plan_finance_stripe_webhook_work"),
      ["2026-10-23T21:00:00.000Z", false],
    );
    await f.source.close();
  });

  it.each([
    { rows: [] },
    { rows: [{ scopes: null, nextWakeAt: null }] },
    { rows: [{ scopes: [{}], nextWakeAt: null }] },
  ])(
    "fails closed on an invalid plan rather than reporting no work: %j",
    async ({ rows }) => {
      const f = setup();
      await f.source.start(f.wake, f.disconnected);
      f.client.query.mockResolvedValueOnce({ rows });
      await expect(f.source.readPlan(new Date())).rejects.toMatchObject({
        reason: "CONFIGURATION",
      });
      await f.source.close();
    },
  );

  it("distinguishes revoked permissions from connection loss without leaking the error", async () => {
    const f = setup();
    await f.source.start(f.wake, f.disconnected);
    f.client.query.mockRejectedValueOnce({
      code: "42501",
      message: "sensitive internal detail",
    });
    await expect(f.source.readPlan(new Date())).rejects.toMatchObject({
      reason: "PERMISSION",
      message: "Finance webhook subscription is unavailable",
    });
    f.client.emit("error", {
      code: "ECONNRESET",
      message: "sensitive connection detail",
    });
    expect(f.disconnected).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "CONNECTION" }),
    );
    await f.source.close();
  });

  it("unsubscribes, closes once and removes owned event listeners", async () => {
    const f = setup();
    await f.source.start(f.wake, f.disconnected);
    await f.source.close();
    await f.source.close();
    expect(f.client.query).toHaveBeenLastCalledWith(
      "UNLISTEN finance_webhook_work",
    );
    expect(f.client.end).toHaveBeenCalledTimes(1);
    for (const event of ["notification", "error", "end"])
      expect(f.client.listenerCount(event)).toBe(0);
    f.client.emit("notification", {
      channel: "finance_webhook_work",
      payload: "",
    });
    expect(f.wake).not.toHaveBeenCalled();
  });

  it("classifies pg's code-less unexpected socket end as reconnectable", async () => {
    const f = setup();
    await f.source.start(f.wake, f.disconnected);
    f.client.emit("error", new Error("Connection terminated unexpectedly"));
    expect(f.disconnected).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "CONNECTION",
        message: "Finance webhook subscription is unavailable",
      }),
    );
    await f.source.close();
  });
});
