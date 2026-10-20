/**
 * License gate: every package in the PRODUCTION dependency closure must use
 * an allow-listed license. Dev-only tools are reported (not shipped).
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ALLOWED = new Set(["MIT", "ISC", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0", "0BSD"]);
const pkg = (name, from = root) => {
  let dir = from;
  for (;;) {
    const p = join(dir, "node_modules", name, "package.json");
    if (existsSync(p)) return { json: JSON.parse(readFileSync(p, "utf8")), dir: dirname(p) };
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
};
const license = (j) => (typeof j.license === "string" ? j.license : j.license?.type ?? (Array.isArray(j.licenses) ? j.licenses.map((l) => l.type).join(" OR ") : "UNKNOWN"));

const self = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const seen = new Map();
const queue = Object.keys(self.dependencies ?? {}).map((n) => [n, root]);
while (queue.length) {
  const [name, from] = queue.shift();
  if (seen.has(name)) continue;
  const found = pkg(name, from);
  if (!found) {
    console.error(`missing production dependency ${name}`);
    process.exit(1);
  }
  seen.set(name, { version: found.json.version, license: license(found.json) });
  for (const dep of Object.keys(found.json.dependencies ?? {})) queue.push([dep, found.dir]);
}
let failed = false;
console.log("Production dependency closure:");
for (const [name, { version, license: lic }] of seen) {
  const ok = lic.split(/\s+OR\s+/).some((l) => ALLOWED.has(l.replace(/[()]/g, "")));
  console.log(`  ${ok ? "ok " : "BAD"} ${name}@${version}  ${lic}`);
  if (!ok) failed = true;
}
console.log(`\nPeer dependencies (provided by the host): ${Object.keys(self.peerDependencies ?? {}).join(", ")}`);
console.log("\nDev-only tools (not shipped):");
for (const name of Object.keys(self.devDependencies ?? {})) {
  const found = pkg(name);
  console.log(`  ${name}@${found?.json.version ?? "?"}  ${found ? license(found.json) : "not installed"}`);
}
if (failed) {
  console.error("\nlicense check: FAILED");
  process.exit(1);
}
console.log("\nlicense check: OK");
