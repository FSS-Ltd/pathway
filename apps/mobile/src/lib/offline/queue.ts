export type SyncQueueItem = {
  id: string;
  kind: "attendance_mark" | "attendance_bulk";
  payload: unknown;
  createdAt: string;
  retryCount: number;
};

const queue: SyncQueueItem[] = [];

// TODO(offline-queue): persist queue locally and add idempotency keys.
export async function enqueueSyncItem(item: SyncQueueItem): Promise<void> {
  queue.push(item);
}

export async function readSyncQueue(): Promise<SyncQueueItem[]> {
  return [...queue];
}

export async function clearSyncQueue(): Promise<void> {
  queue.length = 0;
}
