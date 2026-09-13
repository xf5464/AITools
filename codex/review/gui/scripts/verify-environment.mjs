import { spawnSync } from "node:child_process";
const checks = [["codex", ["--version"]], ["git", ["--version"]], ["node", ["--version"]]];
const report = Object.fromEntries(checks.map(([command, args]) => { const result = spawnSync(command, args, { encoding: "utf8", shell: false }); return [command, { passed: result.status === 0, version: result.stdout.trim(), error: result.stderr.trim() || undefined }]; }));
console.log(JSON.stringify(report, null, 2));
if (Object.values(report).some((value) => !value.passed)) process.exitCode = 1;
