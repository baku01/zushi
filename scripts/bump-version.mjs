#!/usr/bin/env node
// Sets the app version everywhere it is declared, so a push to main releases it.
//
//   node scripts/bump-version.mjs 0.1.18     # explicit version
//   node scripts/bump-version.mjs patch      # 0.1.17 -> 0.1.18 (also: minor, major)
//
// The release workflow publishes v<version> when that tag does not exist yet, and the
// in-app updater only offers releases whose version is higher than the installed one.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const file = (p) => join(root, p);
const read = (p) => readFileSync(file(p), "utf8");

const SEMVER = /^\d+\.\d+\.\d+$/;
const current = JSON.parse(read("src-tauri/tauri.conf.json")).version;
const arg = process.argv[2];

function next(version, part) {
  const [major, minor, patch] = version.split(".").map(Number);
  if (part === "major") return `${major + 1}.0.0`;
  if (part === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

const version = ["major", "minor", "patch"].includes(arg) ? next(current, arg) : arg;
if (!version || !SEMVER.test(version)) {
  console.error("usage: node scripts/bump-version.mjs <x.y.z|major|minor|patch>");
  process.exit(1);
}

// Replace exactly one occurrence, or fail loudly instead of silently skipping a file.
function replaceOnce(path, pattern, replacement) {
  const text = read(path);
  const matches = text.match(new RegExp(pattern.source, pattern.flags.replace("g", "") + "g"));
  if (!matches || matches.length !== 1) {
    console.error(`${path}: expected one match for ${pattern}, found ${matches?.length ?? 0}`);
    process.exit(1);
  }
  writeFileSync(file(path), text.replace(pattern, replacement));
}

replaceOnce("src-tauri/tauri.conf.json", /("version":\s*")[^"]+(")/, `$1${version}$2`);
replaceOnce("package.json", /("version":\s*")[^"]+(")/, `$1${version}$2`);
replaceOnce("src-tauri/Cargo.toml", /(\[package\]\nname = "zushi"\nversion = ")[^"]+(")/, `$1${version}$2`);
replaceOnce("src-tauri/Cargo.lock", /(name = "zushi"\nversion = ")[^"]+(")/, `$1${version}$2`);
for (const readme of ["README.md", "README.en.md"]) {
  replaceOnce(readme, /(badge\/version-)[\d.]+(-)/, `$1${version}$2`);
}

const lock = JSON.parse(read("package-lock.json"));
lock.version = version;
lock.packages[""].version = version;
writeFileSync(file("package-lock.json"), JSON.stringify(lock, null, 2) + "\n");

console.log(`${current} -> ${version}`);
console.log(`Next: git commit -am "chore: release v${version}" && git push`);
