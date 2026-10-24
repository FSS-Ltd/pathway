import { providerJwks, publishableKey } from "./environment";
import { randomUUID } from "node:crypto";
import { prisma, withTenantRlsContext } from "@pathway/db";
import { seedE2eAuthUser, seedE2eTypedRole } from "../../test-helpers.e2e";
import type { MessagingActor } from "../../src/messaging/messaging-access";

export const orgId = randomUUID();
export const siteId = randomUUID();
export const conversationId = randomUUID();
export const sender: MessagingActor = {
  orgId,
  tenantId: siteId,
  userId: randomUUID(),
};
export const recipient: MessagingActor = {
  orgId,
  tenantId: siteId,
  userId: randomUUID(),
};
export let recipientAssignmentId: string;

async function configureProviderAuthentication(): Promise<void> {
  const { setTimeout: delay } = await import("node:timers/promises");
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const configured = await fetch(
        "http://127.0.0.1:15450/api/tenants/realtime-dev",
        {
          method: "PUT",
          signal: AbortSignal.timeout(2_000),
          headers: {
            authorization: `Bearer ${publishableKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ tenant: { jwt_jwks: providerJwks } }),
        },
      );
      await configured.arrayBuffer();
      if (configured.ok) return;
    } catch {
      /* The disposable provider may still be starting. */
    }
    await delay(250);
  }
  throw new Error(
    "Local provider signing-key configuration did not become ready",
  );
}

export async function initialize(): Promise<void> {
  await configureProviderAuthentication();
  await prisma.$executeRawUnsafe(`DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'realtime_provider_writer') THEN
      CREATE ROLE realtime_provider_writer NOLOGIN NOSUPERUSER NOBYPASSRLS;
    END IF;
  END $$`);
  await prisma.$executeRawUnsafe(
    "GRANT USAGE ON SCHEMA app, public TO realtime_provider_writer",
  );
  await prisma.$executeRawUnsafe(
    "GRANT ALL ON ALL TABLES IN SCHEMA app, public TO realtime_provider_writer",
  );
  await prisma.$executeRawUnsafe(
    "GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO realtime_provider_writer",
  );
  await prisma.org.create({
    data: {
      id: orgId,
      name: "Provider fixture",
      slug: orgId,
      planCode: "trial",
    },
  });
  await prisma.orgVertical.create({ data: { orgId, vertical: "ACE_SCHOOL" } });
  await prisma.tenant.create({
    data: { id: siteId, orgId, name: "Provider fixture", slug: siteId },
  });
  for (const key of ["messaging.messages.read", "messaging.messages.send"]) {
    await prisma.permissionDefinition.upsert({
      where: { key },
      update: {},
      create: {
        key,
        label: key,
        description: "Provider fixture permission",
        scope: "site",
        sensitivity: "standard",
      },
    });
  }
  for (const actor of [sender, recipient]) {
    await seedE2eAuthUser({
      subject: actor.userId,
      userId: actor.userId,
      tenantId: siteId,
      orgId,
      siteRole: "STAFF",
      orgRole: "ORG_MEMBER",
    });
    await prisma.user.update({
      where: { id: actor.userId },
      data: { tenantId: siteId },
    });
    const role = await seedE2eTypedRole({
      orgId,
      tenantId: siteId,
      userId: actor.userId,
      scope: "site",
      permissionKeys: ["messaging.messages.read", "messaging.messages.send"],
    });
    if (actor === recipient) recipientAssignmentId = role.assignmentId;
  }
  await withTenantRlsContext(siteId, orgId, (tx) =>
    tx.messageConversation
      .create({
        data: {
          id: conversationId,
          kind: "STAFF_DIRECT",
          tenant: { connect: { id: siteId } },
          createdBy: { connect: { id: sender.userId } },
          participants: {
            create: [sender, recipient].map((actor) => ({
              kind: "STAFF",
              tenant: { connect: { id: siteId } },
              user: { connect: { id: actor.userId } },
            })),
          },
        },
      })
      .then(() => undefined),
  );
}

/** Exercise the real service transaction; source RLS is tested separately. */
export function asWriter<T>(
  operation: () => Promise<T>,
  actor: MessagingActor = sender,
): Promise<T> {
  return withTenantRlsContext(siteId, orgId, async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.user_id', ${actor.userId}, true)`;
    return operation();
  });
}

export async function close(): Promise<void> {
  // The stack owns this disposable database; teardown removes it, rather than
  // selectively disabling production constraints to delete fixture rows.
  await prisma.$disconnect();
}

/** Only the disposable stack started by run.sh may be stopped by outage tests. */
export async function controlGateway(
  operation: "stop" | "start",
): Promise<void> {
  const { execFileSync } = await import("node:child_process");
  const name = process.env.REALTIME_PROVIDER_GATEWAY_CONTAINER;
  const fixtureId = process.env.REALTIME_PROVIDER_FIXTURE_ID;
  if (!name || !fixtureId)
    throw new Error("Owned provider fixture identity is required");
  const actual = execFileSync(
    "docker",
    [
      "inspect",
      "--format",
      '{{ index .Config.Labels "pathway.realtime-fixture" }}',
      name,
    ],
    { encoding: "utf8" },
  ).trim();
  if (actual !== fixtureId)
    throw new Error("Refusing to control an unrelated provider container");
  execFileSync(
    "docker",
    operation === "stop" ? ["stop", "--time", "2", name] : ["start", name],
    { stdio: "pipe", timeout: 15_000 },
  );
}
