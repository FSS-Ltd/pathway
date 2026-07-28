import { randomUUID } from "node:crypto";

const requestIdKey = Symbol("access-control.request-id");

export interface RequestWithRequestId {
  headers?: Record<string, string | string[] | undefined>;
  [requestIdKey]?: string;
}

export function getOrCreateRequestId(request: RequestWithRequestId): string {
  const header = request.headers?.["x-request-id"];
  const inbound = Array.isArray(header) ? header[0] : header;
  if (typeof inbound === "string" && inbound.length > 0) {
    return inbound;
  }

  request[requestIdKey] ??= randomUUID();
  return request[requestIdKey];
}
