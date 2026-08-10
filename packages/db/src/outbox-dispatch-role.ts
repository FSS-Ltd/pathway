export interface OutboxDispatchRoleClient {
  $executeRawUnsafe(query: string): Promise<unknown>;
}

const DISCOVERY_FUNCTION = "app.list_due_outbox_org_ids()";

export function outboxDispatchRoleFromDatabaseUrl(databaseUrl: string): string {
  const encodedRole = new URL(databaseUrl).username;
  const role = decodeURIComponent(encodedRole);
  if (!role) {
    throw new Error(
      "OUTBOX_DISPATCH_DATABASE_URL must include a database role",
    );
  }
  return role;
}

export async function grantOutboxDispatchRole(
  client: OutboxDispatchRoleClient,
  runtimeDatabaseUrl: string,
): Promise<void> {
  const role = outboxDispatchRoleFromDatabaseUrl(runtimeDatabaseUrl);
  const quotedRole = `"${role.replaceAll('"', '""')}"`;
  await client.$executeRawUnsafe(
    `GRANT EXECUTE ON FUNCTION ${DISCOVERY_FUNCTION} TO ${quotedRole}`,
  );
}
