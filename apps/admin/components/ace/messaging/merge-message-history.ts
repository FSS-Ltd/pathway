export function mergeMessageHistory<
  Message extends { id: string; sequence: number },
>(
  existing: readonly Message[],
  latest: readonly Message[],
  existingCursor: string | null,
  latestCursor: string | null,
): { messages: Message[]; nextCursor: string | null } {
  if (!existing.length || !latest.length) {
    return { messages: [...latest], nextCursor: latestCursor };
  }

  const byId = new Map(existing.map((message) => [message.id, message]));
  for (const message of latest) byId.set(message.id, message);
  const messages = [...byId.values()].sort((a, b) => a.sequence - b.sequence);
  const retainedOlder = existing[0]!.sequence < latest[0]!.sequence;
  return {
    messages,
    nextCursor: retainedOlder ? existingCursor : latestCursor,
  };
}
