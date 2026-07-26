import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const matrixPath = "docs/ace-vertical/01-source-and-access-matrix.md";
const adrPath =
  "docs/ace-vertical/adrs/001-ace-packaging-and-access-layers.md";
const buildPlanPath = "docs/NexSteps-ACE-Vertical-Build-Plan.md";

function readRepositoryFile(relativePath) {
  return readFileSync(new URL(relativePath, `file://${repositoryRoot}/`), "utf8");
}

function parseTableCells(line) {
  return line
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const matrix = readRepositoryFile(matrixPath);
const buildPlan = readRepositoryFile(buildPlanPath);
const scannedDocuments = [
  [matrixPath, matrix],
  [adrPath, readRepositoryFile(adrPath)],
  [buildPlanPath, buildPlan],
];

const placeholderPattern =
  /\b(?:TBD|TODO)\b|permission goes here|capability goes here/;
const obsoleteReflectionSpelling = "refleections";

for (const [file, content] of scannedDocuments) {
  assert(
    !placeholderPattern.test(content),
    `${file}: prohibited placeholder remains`,
  );
  assert(
    !content.includes(obsoleteReflectionSpelling),
    `${file}: obsolete Faith reflection path spelling remains`,
  );
}

const requiredHeader =
  "| ID | Method | Path | capability | permission | persona | membership | relationship | releasePolicy | featureToggle | sensitivity | tenantRls |";
const matrixLines = matrix.split(/\r?\n/);
assert(matrixLines.includes(requiredHeader), "required route header is missing");

const routeLines = matrixLines.filter((line) => /^\| R\d{2} \|/.test(line));
assert(
  routeLines.length === 68,
  `expected 68 exact route rows, found ${routeLines.length}`,
);

const allowedMethods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const allowedSensitivities = new Set(["standard", "sensitive", "protected"]);
const actualRoutes = new Map();

routeLines.forEach((line, index) => {
  const cells = parseTableCells(line);
  const expectedId = `R${String(index + 1).padStart(2, "0")}`;

  assert(
    cells.length === 12,
    `${cells[0] || expectedId}: expected 12 cells, found ${cells.length}`,
  );
  assert(
    cells.every((cell) => cell.length > 0),
    `${cells[0] || expectedId}: blank required cell`,
  );
  assert(
    cells[0] === expectedId,
    `expected route ID ${expectedId}, found ${cells[0]}`,
  );
  assert(allowedMethods.has(cells[1]), `${cells[0]}: invalid HTTP method`);

  const path = cells[2].replaceAll("`", "");
  assert(path.startsWith("/"), `${cells[0]}: invalid route path`);
  const routeKey = `${cells[1]} ${path}`;
  assert(!actualRoutes.has(routeKey), `${cells[0]}: duplicate ${routeKey}`);

  const sensitivity = cells[10].replaceAll("`", "");
  assert(
    allowedSensitivities.has(sensitivity),
    `${cells[0]}: invalid sensitivity ${cells[10]}`,
  );
  actualRoutes.set(routeKey, {
    id: cells[0],
    permission: cells[4].replaceAll("`", ""),
    sensitivity,
  });
});

const sourceStart = buildPlan.indexOf("## 8.2 Access-control endpoints");
const sourceEnd = buildPlan.indexOf("## 8.5 Add-on endpoints");
assert(sourceStart >= 0 && sourceEnd > sourceStart, "source route sections missing");

const expectedRoutes = [];
const sourceSection = buildPlan.slice(sourceStart, sourceEnd);
for (const line of sourceSection.split(/\r?\n/)) {
  const match = line.match(
    /^(GET|POST|PUT|PATCH|DELETE)(?:\/(GET|POST|PUT|PATCH|DELETE))? (\/.+)$/,
  );
  if (!match) {
    continue;
  }

  expectedRoutes.push(`${match[1]} ${match[3]}`);
  if (match[2]) {
    expectedRoutes.push(`${match[2]} ${match[3]}`);
  }
}

assert(
  expectedRoutes.length === 68,
  `expected source to expand to 68 routes, found ${expectedRoutes.length}`,
);
assert(
  new Set(expectedRoutes).size === expectedRoutes.length,
  "source contains duplicate method/path routes",
);

const missingRoutes = expectedRoutes.filter(
  (route) => !actualRoutes.has(route),
);
const extraRoutes = [...actualRoutes.keys()].filter(
  (route) => !expectedRoutes.includes(route),
);
assert(
  missingRoutes.length === 0 && extraRoutes.length === 0,
  `source parity failed: ${JSON.stringify({ missingRoutes, extraRoutes })}`,
);

const addOnLines = matrixLines.filter((line) =>
  /^\| ADDON-\d{2} \|/.test(line),
);
assert(
  addOnLines.length === 4,
  `expected 4 unresolved add-on families, found ${addOnLines.length}`,
);
addOnLines.forEach((line, index) => {
  const cells = parseTableCells(line);
  const expectedId = `ADDON-${String(index + 1).padStart(2, "0")}`;

  assert(
    cells.length === 6 && cells.every((cell) => cell.length > 0),
    `${cells[0] || expectedId}: invalid or blank add-on family cell`,
  );
  assert(cells[0] === expectedId, `expected ${expectedId}, found ${cells[0]}`);
  assert(
    cells[5] === "Open; methods and paths unspecified",
    `${cells[0]}: add-on API contract must remain unresolved`,
  );
});

assert(
  actualRoutes.get("POST /ace/faith/content/:id/read")?.sensitivity ===
    "sensitive",
  "Faith read-receipt route must be sensitive",
);
const communitySpaceCreation = actualRoutes.get("POST /ace/community/spaces");
assert(
  communitySpaceCreation?.permission === "ace.community.spaces.manage" &&
    communitySpaceCreation.sensitivity === "standard",
  "ordinary Community space creation must use the standard ace.community.spaces.manage permission",
);
const communityModeration = actualRoutes.get(
  "POST /ace/community/posts/:postId/moderate",
);
assert(
  communityModeration?.permission === "ace.community.moderate" &&
    communityModeration.sensitivity === "protected",
  "Community moderation must use the protected ace.community.moderate permission",
);
assert(
  expectedRoutes.filter((route) => route.endsWith("/reflections")).length === 2,
  "expected GET and POST Faith reflection routes",
);

console.log(
  "ACE-F01 matrix validation passed: 68 source-matched unique populated routes; 4 unresolved add-on families; placeholders and obsolete spelling absent.",
);
