import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const databaseUrl = process.env.REALTIME_NOTIFICATION_TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const migrationPath = path.resolve(
  __dirname,
  "../../prisma/migrations/20261204000000_transactional_realtime_notifications/migration.sql",
);

function sql(statement: string): string {
  if (!databaseUrl) throw new Error("Notification test database is required");
  const url = new URL(databaseUrl);
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/pathway_realtime_notifications_test"
  ) {
    throw new Error(
      "Use the dedicated local pathway_realtime_notifications_test database",
    );
  }
  return execFileSync(
    "psql",
    [databaseUrl, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"],
    {
      input: statement,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    },
  ).trim();
}

function initialize(coreSchema = "app", messageSchema = "app"): void {
  sql(`
    DROP SCHEMA IF EXISTS app CASCADE;
    DROP TABLE IF EXISTS public."MessageParticipantReadCursor", public."Message", public."OutboxEvent", public."Tenant" CASCADE;
    CREATE SCHEMA app;
    CREATE FUNCTION app.current_org_id() RETURNS text LANGUAGE sql STABLE
      AS $$ SELECT NULLIF(current_setting('app.org_id', true), '') $$;
    CREATE TABLE ${coreSchema}."Tenant" ("id" text PRIMARY KEY, "orgId" text NOT NULL);
    INSERT INTO ${coreSchema}."Tenant" VALUES ('site-1', 'org-1'), ('site-2', 'org-2');
    CREATE TABLE ${coreSchema}."OutboxEvent" (
      "id" text PRIMARY KEY, "orgId" text NOT NULL, "aggregateType" text NOT NULL,
      "aggregateId" text NOT NULL, "eventType" text NOT NULL, "payload" jsonb NOT NULL,
      "idempotencyKey" text NOT NULL, "status" text DEFAULT 'PENDING',
      "createdAt" timestamp DEFAULT CURRENT_TIMESTAMP,
      UNIQUE ("orgId", "idempotencyKey")
    );
    ALTER TABLE ${coreSchema}."OutboxEvent" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ${coreSchema}."OutboxEvent" FORCE ROW LEVEL SECURITY;
    CREATE POLICY outbox_scope ON ${coreSchema}."OutboxEvent"
      USING ("orgId" = app.current_org_id()) WITH CHECK ("orgId" = app.current_org_id());
    CREATE TABLE ${messageSchema}."Message" (
      "id" text PRIMARY KEY, "tenantId" text NOT NULL, "conversationId" text NOT NULL,
      "bodyEncrypted" text NOT NULL DEFAULT 'never broadcast this sensitive text'
    );
    CREATE TABLE ${messageSchema}."MessageParticipantReadCursor" (
      "id" text PRIMARY KEY, "tenantId" text NOT NULL, "conversationId" text NOT NULL,
      "participantId" text NOT NULL, "lastReadSequence" integer NOT NULL
    );
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'realtime_test_backend') THEN
        CREATE ROLE realtime_test_backend NOLOGIN NOSUPERUSER NOBYPASSRLS;
      END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOBYPASSRLS;
      END IF;
    END $$;
    GRANT USAGE ON SCHEMA app, public TO realtime_test_backend;
    GRANT ALL ON ALL TABLES IN SCHEMA app, public TO realtime_test_backend;
    GRANT EXECUTE ON FUNCTION app.current_org_id() TO realtime_test_backend;
  `);
  sql(readFileSync(migrationPath, "utf8"));
}

function write(statement: string, orgId = "org-1"): string {
  return sql(
    `SET ROLE realtime_test_backend; SET app.org_id = '${orgId}'; SET app.realtime_capture_enabled = 'on'; ${statement}`,
  );
}

suite("transactional realtime notification capture", () => {
  it.each([
    ["app", "app"],
    ["public", "app"],
    ["public", "public"],
  ])(
    "captures private metadata in the %s core / %s messaging layout",
    (core, messages) => {
      initialize(core, messages);
      write(
        `INSERT INTO ${messages}."Message" ("id", "tenantId", "conversationId") VALUES ('message-1', 'site-1', 'conversation-1');`,
      );
      const rows: unknown = JSON.parse(
        sql(`SELECT COALESCE(json_agg(json_build_object(
      'org', "orgId", 'type', "eventType", 'payload', "payload", 'status', "status"
    )), '[]') FROM ${core}."OutboxEvent";`),
      );
      expect(rows).toEqual([
        {
          org: "org-1",
          type: "realtime.message.created",
          status: "PENDING",
          payload: {
            type: "message.created",
            conversationId: "conversation-1",
            messageId: "message-1",
          },
        },
      ]);
    },
  );

  it("leaves capture disabled until the realtime consumer is ready", () => {
    initialize();
    sql(`SET ROLE realtime_test_backend; SET app.org_id = 'org-1';
      INSERT INTO app."Message" ("id", "tenantId", "conversationId") VALUES ('message-1', 'site-1', 'conversation-1');`);
    expect(sql('SELECT count(*) FROM app."Message";')).toBe("1");
    expect(sql('SELECT count(*) FROM app."OutboxEvent";')).toBe("0");
  });

  it("rolls back notification intent with its source write", () => {
    initialize();
    expect(
      write(`BEGIN;
      INSERT INTO app."Message" ("id", "tenantId", "conversationId") VALUES ('message-1', 'site-1', 'conversation-1');
      SELECT count(*) FROM app."OutboxEvent"; ROLLBACK;
      SELECT count(*) FROM app."OutboxEvent";
    `),
    ).toBe("1\n0");
    expect(sql('SELECT count(*) FROM app."Message";')).toBe("0");
  });

  it("keeps notification capture idempotent when an insert is replayed", () => {
    initialize();
    write(`INSERT INTO app."Message" ("id", "tenantId", "conversationId") VALUES ('message-1', 'site-1', 'conversation-1');
      INSERT INTO app."Message" ("id", "tenantId", "conversationId") VALUES ('message-1', 'site-1', 'conversation-1') ON CONFLICT DO NOTHING;`);
    expect(sql('SELECT count(*) FROM app."OutboxEvent";')).toBe("1");
  });

  it("records only read-cursor advances and excludes reader identity", () => {
    initialize();
    write(`INSERT INTO app."MessageParticipantReadCursor" VALUES ('cursor-1', 'site-1', 'conversation-1', 'participant-1', 1);
      UPDATE app."MessageParticipantReadCursor" SET "lastReadSequence" = 1;
      UPDATE app."MessageParticipantReadCursor" SET "lastReadSequence" = 2;
      UPDATE app."MessageParticipantReadCursor" SET "lastReadSequence" = 1;
      UPDATE app."MessageParticipantReadCursor" SET "lastReadSequence" = 2;`);
    const payloads: unknown = JSON.parse(
      sql(`SELECT COALESCE(json_agg("payload"), '[]') FROM app."OutboxEvent";`),
    );
    expect(payloads).toEqual([
      {
        type: "conversation.read",
        conversationId: "conversation-1",
        readerScope: "participant",
      },
      {
        type: "conversation.read",
        conversationId: "conversation-1",
        readerScope: "participant",
      },
    ]);
  });

  it("rejects mismatched organisation context atomically", () => {
    initialize();
    expect(() =>
      write(
        `INSERT INTO app."Message" ("id", "tenantId", "conversationId") VALUES ('message-1', 'site-2', 'conversation-2');`,
      ),
    ).toThrow();
    expect(sql('SELECT count(*) FROM app."Message";')).toBe("0");
    expect(sql('SELECT count(*) FROM app."OutboxEvent";')).toBe("0");
  });

  it("does not expose captured intents across organisations or to browser roles", () => {
    initialize();
    write(
      `INSERT INTO app."Message" ("id", "tenantId", "conversationId") VALUES ('message-1', 'site-1', 'conversation-1');`,
    );
    expect(write('SELECT count(*) FROM app."OutboxEvent";', "org-2")).toBe("0");
    expect(() =>
      sql('SET ROLE authenticated; SELECT * FROM app."OutboxEvent";'),
    ).toThrow();
  });
});
