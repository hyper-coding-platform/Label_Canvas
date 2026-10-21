/**
 * `prepublishOnly` gate: run the full `npm run verify` before any upload.
 *
 * `npm publish --dry-run` exports `npm_config_dry_run=true` to lifecycle scripts. attw's
 * `--pack` (in `check:package`) then runs its own `npm pack` as a dry run, writes no tarball
 * and fails with "error while checking file". The flag is removed for the checks only; the
 * publish itself stays a dry run.
 */
import { spawnSync } from "node:child_process";

const env = { ...process.env };
for (const key of Object.keys(env)) if (key.toLowerCase() === "npm_config_dry_run") delete env[key];

const result = spawnSync("npm run verify", { stdio: "inherit", env, shell: true });
if (result.status !== 0) {
  console.error("prepublish: `npm run verify` failed; nothing will be published.");
  process.exit(result.status ?? 1);
}
console.log("prepublish: all release checks passed.");
