import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULT_ENV_CANDIDATES = [
  "env.production",
  ".env.production",
  ".env.prod",
];

export function getArgValue(name) {
  const prefix = `${name}=`;
  const args = process.argv.slice(2).filter((item) => item !== "--");

  for (let index = 0; index < args.length; index += 1) {
    const item = args[index];
    if (item.startsWith(prefix)) {
      return item.slice(prefix.length);
    }
    if (item === name) {
      const value = args[index + 1];
      return value && !value.startsWith("--") ? value : undefined;
    }
  }

  return undefined;
}

export function isPresent(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function resolveEnvFile({
  explicit = getArgValue("--env-file") ?? process.env.ENV_FILE,
  candidates = DEFAULT_ENV_CANDIDATES,
  cwd = process.cwd(),
} = {}) {
  const paths = explicit ? [explicit] : candidates;
  const found = paths
    .map((candidate) => path.resolve(cwd, candidate))
    .find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(`No env file found. Checked: ${paths.join(", ")}`);
  }
  return found;
}

export function loadEnvFile(filePath) {
  return parseEnvFile(fs.readFileSync(filePath, "utf8"));
}

export function parseEnvFile(contents) {
  const parsed = {};
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const withoutExport = trimmed.startsWith("export ")
      ? trimmed.slice("export ".length).trim()
      : trimmed;
    const equalsIndex = withoutExport.indexOf("=");
    if (equalsIndex <= 0) continue;

    const key = withoutExport.slice(0, equalsIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    parsed[key] = parseEnvValue(withoutExport.slice(equalsIndex + 1).trim());
  }
  return parsed;
}

function parseEnvValue(value) {
  if (!value) return "";
  const quote = value[0];
  if (
    (quote === '"' || quote === "'" || quote === "`") &&
    value.endsWith(quote)
  ) {
    const inner = value.slice(1, -1);
    return quote === '"'
      ? inner.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t")
      : inner;
  }
  return stripUnquotedComment(value).trim();
}

function stripUnquotedComment(value) {
  const commentIndex = value.search(/\s#/);
  return commentIndex >= 0 ? value.slice(0, commentIndex) : value;
}
