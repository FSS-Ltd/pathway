import { createRequire } from "node:module";
import { log } from "node:console";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, rm, writeFile } from "node:fs/promises";

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = resolve(apiRoot, "api/serverless");
const require = createRequire(import.meta.url);
const ncc = require("@vercel/ncc");

const { code, assets } = await ncc(
  resolve(apiRoot, "api/bootstrap-entry.mjs"),
  {
    externals: ["@prisma/client"],
    sourceMap: false,
    target: "es2022",
  },
);
const bundleCode = [
  'import { dirname as __apiBundlePathDirname } from "node:path";',
  'import { fileURLToPath as __apiBundleFileURLToPath } from "node:url";',
  "const __filename = __apiBundleFileURLToPath(import.meta.url);",
  "const __dirname = __apiBundlePathDirname(__filename);",
  code,
].join("\n");

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await writeFile(join(outputDirectory, "index.mjs"), bundleCode);

for (const [assetPath, asset] of Object.entries(assets)) {
  const assetDestination = resolve(outputDirectory, assetPath);
  const destinationRelative = relative(outputDirectory, assetDestination);
  if (
    destinationRelative === ".." ||
    destinationRelative.startsWith(`..${sep}`)
  ) {
    throw new Error(`ncc emitted an asset outside its output: ${assetPath}`);
  }

  await mkdir(dirname(assetDestination), { recursive: true });
  await writeFile(assetDestination, asset.source, {
    ...(asset.permissions === undefined ? {} : { mode: asset.permissions }),
  });
}

log(
  `Built API serverless bundle (${Object.keys(assets).length} assets) at ${relative(apiRoot, outputDirectory)}`,
);
