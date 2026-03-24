import { readSyncQueue } from "./queue";

export type SyncRunResult = {
  attempted: number;
  succeeded: number;
  failed: number;
};

// TODO(sync-engine): execute queued mutations against API with retries and conflict handling.
export async function runSyncCycle(): Promise<SyncRunResult> {
  const pending = await readSyncQueue();

  return {
    attempted: pending.length,
    succeeded: 0,
    failed: pending.length,
  };
}
