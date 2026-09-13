import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
for (const [command, directory] of [["generate-ts", "generated"], ["generate-json-schema", "json"]]) {
  const out = resolve(root, "schemas", directory);
  mkdirSync(out, { recursive: true });
  const result = spawnSync("codex", ["app-server", command, "--out", out], { stdio: "inherit", shell: false });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
