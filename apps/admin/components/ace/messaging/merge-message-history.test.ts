import assert from "node:assert/strict";
import { mergeMessageHistory } from "./merge-message-history";

const old = [
  { id: "old", sequence: 1, deliveryState: "sent" },
  { id: "current", sequence: 2, deliveryState: "sent" },
];
const latest = [
  { id: "current", sequence: 2, deliveryState: "read" },
  { id: "new", sequence: 3, deliveryState: "sent" },
];

assert.deepEqual(mergeMessageHistory(old, latest, "older-page", "newer-page"), {
  messages: [old[0], latest[0], latest[1]],
  nextCursor: "older-page",
});
assert.deepEqual(mergeMessageHistory([], latest, null, "newer-page"), {
  messages: latest,
  nextCursor: "newer-page",
});
