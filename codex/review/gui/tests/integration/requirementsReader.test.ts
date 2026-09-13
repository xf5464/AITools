import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readRequirementsSnapshot } from "../../src/main/requirements/requirementsReader";
describe("requirements reader integration", () => { it("returns a stable normalized snapshot", async () => { const root = await mkdtemp(join(tmpdir(), "review-manager-rules-")); try { const path = join(root, "规则.md"); await writeFile(path, "# 审核\r\n\r\n检查错误。\r\n"); const snapshot = await readRequirementsSnapshot(path); expect(snapshot.content).toBe("# 审核\n\n检查错误。"); expect(snapshot.sha256).toMatch(/^[0-9a-f]{64}$/); expect(snapshot.path).toContain("规则.md"); } finally { await rm(root, { recursive: true, force: true }); } }); });
