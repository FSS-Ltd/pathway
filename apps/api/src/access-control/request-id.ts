import { randomUUID } from "node:crypto";

const requestIdKey = Symbol("access-control.request-id");
const VALID_REQUEST_ID = /^[!-~]{1,128}$/;

export interface RequestWithRequestId {
  headers?: Record<string, string | string[] | undefined>;
  [requestIdKey]?: string;
}

export function getOrCreateRequestId(request: RequestWithRequestId): string {
  const header = request.headers?.["x-request-id"];
  const inbound = Array.isArray(header) ? header[0] : header;
  if (typeof inbound === "string" && VALID_REQUEST_ID.test(inbound)) {
    return inbound;
  }

  request[requestIdKey] ??= randomUUID();
  return request[requestIdKey];
}
