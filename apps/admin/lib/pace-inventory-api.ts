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

export type PaceInventoryBulkInput = {
  childId: string;
  subjectId: string;
  paceNumbers: number[];
};

export type PaceInventoryOrderResult = {
  batchId: string;
  orderIds: string[];
  created: number;
};

export type PaceInventoryStockResult = {
  batchId: string;
  supplyIds: string[];
  created: number;
};

export type PaceInventoryNextOrderStatus = "IN_TRANSIT" | "DELIVERED";

export type PaceInventoryOrderStatusResult = {
  orderId: string;
  status: PaceInventoryNextOrderStatus;
  reachedAt: string;
  supplyId: string | null;
};

export async function advancePaceInventoryOrder(
  orderId: string,
  status: PaceInventoryNextOrderStatus,
): Promise<PaceInventoryOrderStatusResult> {
  if (isUsingMockApi()) {
    throw new Error(
      "Physical PACE inventory changes are not available in mock mode.",
    );
  }
  const response = await fetch(
    `${API_BASE_URL}/ace/pace/inventory/orders/${encodeURIComponent(orderId)}/status`,
    {
      method: "PATCH",
      headers: buildAuthHeaders(),
      credentials: "include",
      cache: "no-store",
      body: JSON.stringify({ status }),
    },
  );
  if (!response.ok) throw await paceRequestError(response);
  return response.json() as Promise<PaceInventoryOrderStatusResult>;
}

export async function createPaceInventoryOrders(
  input: PaceInventoryBulkInput,
): Promise<PaceInventoryOrderResult> {
  return writeInventoryBatch<PaceInventoryOrderResult>("orders", input);
}

export async function addPaceInventoryCurrentStock(
  input: PaceInventoryBulkInput,
): Promise<PaceInventoryStockResult> {
  return writeInventoryBatch<PaceInventoryStockResult>("stock", input);
}

async function writeInventoryBatch<T>(
  view: "orders" | "stock",
  input: PaceInventoryBulkInput,
): Promise<T> {
  if (isUsingMockApi()) {
    throw new Error(
      "Physical PACE inventory changes are not available in mock mode.",
    );
  }
  const response = await fetch(`${API_BASE_URL}/ace/pace/inventory/${view}`, {
    method: "POST",
    headers: buildAuthHeaders(),
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await paceRequestError(response);
  return response.json() as Promise<T>;
}

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
