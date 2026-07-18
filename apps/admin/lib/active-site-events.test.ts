import assert from "node:assert/strict";
import {
  notifyActiveSiteChanged,
  subscribeToActiveSiteChanges,
} from "./active-site-events";

const target = new EventTarget();
let notifications = 0;
const unsubscribe = subscribeToActiveSiteChanges(() => {
  notifications += 1;
}, target);

notifyActiveSiteChanged(target);
assert.equal(notifications, 1, "successful site changes notify subscribers");

unsubscribe();
notifyActiveSiteChanged(target);
assert.equal(notifications, 1, "unsubscribed listeners are not notified");

console.log("active site event checks passed");
