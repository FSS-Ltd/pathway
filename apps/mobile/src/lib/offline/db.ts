export type OfflineStoreInfo = {
  initialized: boolean;
};

let initialized = false;

// TODO(offline-db): replace with real local database adapter and migration strategy.
export async function initOfflineStore(): Promise<OfflineStoreInfo> {
  initialized = true;
  return { initialized };
}

export function getOfflineStoreInfo(): OfflineStoreInfo {
  return { initialized };
}
