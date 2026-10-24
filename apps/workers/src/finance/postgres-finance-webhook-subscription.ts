import { Client, type ClientConfig } from "pg";
import type {
  FinanceWebhookSubscription,
  FinanceWebhookWakePlan,
} from "./finance-webhook-subscription";
import { FinanceWebhookSubscriptionError } from "./finance-webhook-subscription-error";
import { financeWebhookPostgresConfig } from "./finance-webhook-postgres-config";
import {
  isFinanceWebhookRecord,
  parseFinanceWebhookWakePlan,
} from "./finance-webhook-wake-plan";

type FinanceWebhookPgEvent = "notification" | "error" | "end";

interface FinanceWebhookPgClient {
  connect(): Promise<void>;
  query(sql: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
  end(): Promise<void>;
  on(
    event: FinanceWebhookPgEvent,
    callback: (...values: unknown[]) => void,
  ): unknown;
  removeListener(
    event: FinanceWebhookPgEvent,
    callback: (...values: unknown[]) => void,
  ): unknown;
}

const channel = "finance_webhook_work";

export class PostgresFinanceWebhookSubscription implements FinanceWebhookSubscription {
  private readonly config: ClientConfig;
  private client: FinanceWebhookPgClient | null = null;
  private connected = false;
  private listening = false;
  private closed = false;
  private closing: Promise<void> | null = null;
  private onWake: () => void = () => {};
  private onDisconnect: (error: unknown) => void = () => {};

  constructor(
    rawUrl: string,
    private readonly livemode: boolean,
    private readonly createClient: (
      config: ClientConfig,
    ) => FinanceWebhookPgClient = createFinanceWebhookPgClient,
  ) {
    this.config = financeWebhookPostgresConfig(rawUrl);
    if (typeof livemode !== "boolean")
      throw new FinanceWebhookSubscriptionError("CONFIGURATION");
  }

  async start(
    onWake: () => void,
    onDisconnect: (error: unknown) => void,
  ): Promise<void> {
    if (this.client || this.closed)
      throw new FinanceWebhookSubscriptionError("CONFIGURATION");
    this.onWake = onWake;
    this.onDisconnect = onDisconnect;
    const client = this.createClient(this.config);
    this.client = client;
    client.on("notification", this.notification);
    client.on("error", this.connectionError);
    client.on("end", this.connectionEnded);
    try {
      await client.connect();
      this.connected = true;
      const role = await client.query(
        "SELECT rolsuper, rolbypassrls FROM pg_catalog.pg_roles WHERE rolname = CURRENT_USER",
      );
      if (
        role.rows.length !== 1 ||
        !isFinanceWebhookRecord(role.rows[0]) ||
        role.rows[0].rolsuper !== false ||
        role.rows[0].rolbypassrls !== false
      )
        throw new FinanceWebhookSubscriptionError("PERMISSION");
      await client.query(`LISTEN ${channel}`);
      this.listening = true;
    } catch (error) {
      throw subscriptionError(error);
    }
  }

  async readPlan(now: Date): Promise<FinanceWebhookWakePlan> {
    if (
      !this.client ||
      !this.listening ||
      this.closed ||
      !Number.isFinite(now.getTime())
    )
      throw new FinanceWebhookSubscriptionError("CONFIGURATION");
    try {
      const result = await this.client.query(
        'SELECT "scopes", "nextWakeAt" FROM app.plan_finance_stripe_webhook_work($1::timestamptz, $2::boolean, 50)',
        [now.toISOString(), this.livemode],
      );
      return parseFinanceWebhookWakePlan(result.rows);
    } catch (error) {
      throw subscriptionError(error);
    }
  }

  close(): Promise<void> {
    if (!this.closing) this.closing = this.shutdown();
    return this.closing;
  }

  private async shutdown(): Promise<void> {
    this.closed = true;
    const client = this.client;
    if (!client) return;
    try {
      if (this.connected && this.listening)
        await client.query(`UNLISTEN ${channel}`);
    } finally {
      try {
        await client.end();
      } finally {
        client.removeListener("notification", this.notification);
        client.removeListener("error", this.connectionError);
        client.removeListener("end", this.connectionEnded);
      }
    }
  }

  private readonly notification = (value: unknown): void => {
    if (
      !this.closed &&
      isFinanceWebhookRecord(value) &&
      value.channel === channel &&
      value.payload === ""
    )
      this.onWake();
  };

  private readonly connectionError = (error: unknown): void => {
    this.connected = false;
    if (!this.closed) this.onDisconnect(subscriptionError(error, "CONNECTION"));
  };

  private readonly connectionEnded = (): void => {
    this.connected = false;
    if (!this.closed)
      this.onDisconnect(new FinanceWebhookSubscriptionError("CONNECTION"));
  };
}

function createFinanceWebhookPgClient(
  config: ClientConfig,
): FinanceWebhookPgClient {
  const client = new Client(config);
  return {
    connect: async () => {
      await client.connect();
    },
    query: async (sql, values) => {
      const result = await client.query<Record<string, unknown>>(sql, values);
      return { rows: result.rows };
    },
    end: () => client.end(),
    on: (event, callback) => client.on(event, callback),
    removeListener: (event, callback) => client.removeListener(event, callback),
  };
}

function subscriptionError(
  error: unknown,
  fallback: "CONNECTION" | "CONFIGURATION" = "CONFIGURATION",
): FinanceWebhookSubscriptionError {
  if (error instanceof FinanceWebhookSubscriptionError) return error;
  const code = isFinanceWebhookRecord(error) ? error.code : undefined;
  if (typeof code === "string") {
    if (code === "42501" || code.startsWith("28"))
      return new FinanceWebhookSubscriptionError("PERMISSION");
    if (
      code.startsWith("08") ||
      [
        "57P01",
        "57P02",
        "57P03",
        "ECONNRESET",
        "ECONNREFUSED",
        "EPIPE",
        "ETIMEDOUT",
        "ENOTFOUND",
        "EAI_AGAIN",
      ].includes(code)
    )
      return new FinanceWebhookSubscriptionError("CONNECTION");
  }
  return new FinanceWebhookSubscriptionError(fallback);
}
