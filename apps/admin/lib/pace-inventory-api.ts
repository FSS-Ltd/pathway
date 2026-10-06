import {
  API_BASE_URL,
  buildAuthHeaders,
  isUsingMockApi,
  paceRequestError,
} from "./api-client";

export type InventoryPage<T> = {
  items: T[];
  nextCursor: string | null;
};

export type PaceInventoryStockItem = {
  child: { id: string; displayName: string };
  subject: { id: string; name: string };
  currentPace: number;
  futurePaceNumbers: number[];
  availableCount: number;
  hasPendingOrder: boolean;
  stockState: "NO_STOCK" | "LOW_STOCK" | "SUFFICIENT";
  needsAttention: boolean;
};

export type PaceInventoryOrderItem = {
  id: string;
  child: { id: string; displayName: string };
  subject: { id: string; name: string };
  paceNumber: number;
  status: "ORDERED" | "IN_TRANSIT" | "DELIVERED";
  orderedAt: string;
  inTransitAt: string | null;
  deliveredAt: string | null;
};

export type InventoryPageQuery = {
  cursor?: string;
  signal?: AbortSignal;
};

export function fetchPaceInventoryAttention({
  cursor,
  signal,
}: InventoryPageQuery = {}): Promise<InventoryPage<PaceInventoryStockItem>> {
  return requestInventoryPage<PaceInventoryStockItem>(
    "stock",
    { attentionOnly: "true", cursor },
    signal,
  );
}

export function fetchPaceInventoryStock({
  cursor,
  signal,
}: InventoryPageQuery = {}): Promise<InventoryPage<PaceInventoryStockItem>> {
  return requestInventoryPage<PaceInventoryStockItem>(
    "stock",
    { cursor },
    signal,
  );
}

export function fetchPaceInventoryOrders({
  cursor,
  signal,
}: InventoryPageQuery = {}): Promise<InventoryPage<PaceInventoryOrderItem>> {
  return requestInventoryPage<PaceInventoryOrderItem>(
    "orders",
    { cursor },
    signal,
  );
}

async function requestInventoryPage<T>(
  view: "stock" | "orders",
  query: { attentionOnly?: "true"; cursor?: string },
  signal?: AbortSignal,
): Promise<InventoryPage<T>> {
  if (isUsingMockApi()) return { items: [], nextCursor: null };

  const params = new URLSearchParams({ limit: "50" });
  if (query.attentionOnly) params.set("attentionOnly", query.attentionOnly);
  if (query.cursor) params.set("cursor", query.cursor);
  const response = await fetch(
    `${API_BASE_URL}/ace/pace/inventory/${view}?${params.toString()}`,
    {
      headers: buildAuthHeaders(),
      credentials: "include",
      cache: "no-store",
      signal,
    },
  );
  if (!response.ok) throw await paceRequestError(response);
  return response.json() as Promise<InventoryPage<T>>;
}
