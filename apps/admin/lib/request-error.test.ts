import assert from "node:assert/strict";
import { ApiError } from "./api-transport";
import { requestFailure } from "./request-error";

const unavailable = requestFailure(
  new ApiError("secret SQL details", 503, "DATABASE_UNAVAILABLE", "ref-1"),
  "Unable to load people.",
);
assert.deepEqual(unavailable, {
  kind: "unavailable",
  message: "Unable to load people. Reference: ref-1",
});
assert.equal(
  requestFailure(new ApiError("raw body", 403, "DENIED", null), "Fallback")
    .kind,
  "denied",
);
assert.equal(
  requestFailure(
    new ApiError("raw body", 401, "UNAUTHENTICATED", null),
    "Fallback",
  ).kind,
  "session",
);
assert.equal(
  requestFailure(new Error("raw body"), "Safe fallback.").message,
  "Safe fallback.",
);

process.stdout.write("request error states: passed\n");
