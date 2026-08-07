import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("./use-session-compat.tsx", import.meta.url),
  "utf8",
);

assert.doesNotMatch(
  source,
  /console\.log/,
  "session resolution must not contain ad-hoc console.log diagnostics",
);

// Clerk session tokens default to a 60s lifetime. Without a background
// refresh well inside that window, every apps/admin API call started more
// than ~60s into a session gets a stale token and 401s with an "exp" claim
// failure (see the roles/access audit log bug). Guard against regressing
// back to "resolve token once per sign-in".
const intervalMatch = source.match(
  /setInterval\(\s*\(\)\s*=>\s*{\s*void getToken\(\)\.then\(\(token[^)]*\)\s*=>\s*setApiClientToken\(token\)\);\s*}\s*,\s*([\d_]+)\s*\)/,
);
assert.ok(
  intervalMatch,
  "expected a setInterval that refreshes the api-client token via getToken()",
);
const intervalMs = Number(intervalMatch![1].replace(/_/g, ""));
assert.ok(
  intervalMs > 0 && intervalMs < 60_000,
  `token refresh interval (${intervalMs}ms) must be well under Clerk's 60s default token lifetime`,
);

console.log("session compat logging checks passed");
