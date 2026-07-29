import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const dataSource = await readFile(
  new URL("src/wireframes-data.ts", root),
  "utf8",
);
const regulationsSource = await readFile(
  new URL("src/regulations-wireframes.ts", root),
  "utf8",
);

const expectedRegulationsIds = [
  "regulations-jurisdiction",
  "regulations-overview",
  "regulations-requirements",
  "regulations-requirement-detail",
  "regulations-evidence",
  "regulations-evidence-upload",
  "regulations-updates",
  "regulations-update-detail",
  "regulations-correspondence",
  "regulations-correspondence-detail",
  "regulations-correspondence-add",
  "regulations-pack-scope",
  "regulations-pack-evidence",
  "regulations-pack-preview",
  "regulations-pack-share",
  "regulations-share-confirmation",
  "regulations-share-activity",
];

const combined = `${dataSource}\n${regulationsSource}`;
const ids = [
  ...combined.matchAll(/\bid:\s*"([^"]+)"[\s\S]{0,100}?\bgroup:\s*"[^"]+"/g),
].map(([, id]) => id);
const targets = [
  ...combined.matchAll(/\b(?:primaryTarget|target):\s*"([^"]+)"/g),
].map(([, target]) => target);

assert.equal(new Set(ids).size, ids.length, "screen IDs must be unique");
for (const id of expectedRegulationsIds) {
  assert.ok(ids.includes(id), `missing regulations screen: ${id}`);
}
for (const target of targets) {
  assert.ok(ids.includes(target), `broken internal target: ${target}`);
}

assert.match(dataSource, /id:\s*"regulations-evidence"/);
assert.match(regulationsSource, /group:\s*"regulations-evidence"/);
assert.match(dataSource, /target:\s*"regulations-overview"/);
assert.match(regulationsSource, /England/);
assert.match(regulationsSource, /Wales/);
assert.match(regulationsSource, /Scotland/);
assert.match(regulationsSource, /Northern Ireland/);
assert.match(regulationsSource, /does not provide legal advice/i);
assert.doesNotMatch(
  regulationsSource,
  /\b(?:legally compliant|guaranteed protection|proves compliance)\b/i,
);

console.log(
  `Validated ${expectedRegulationsIds.length} Regulations & Evidence screens.`,
);
