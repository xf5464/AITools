import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { RequirementsSnapshot } from "../../src/shared/contracts";
import { ReviewRequirementsService } from "../../src/main/requirements/ReviewRequirementsService";
import { readRequirementsSnapshot } from "../../src/main/requirements/requirementsReader";
describe("requirements reader integration", () => { it("returns a stable normalized snapshot", async () => { const root = await mkdtemp(join(tmpdir(), "review-manager-rules-")); try { const path = join(root, "规则.md"); await writeFile(path, "# 审核\r\n\r\n检查错误。\r\n"); const snapshot = await readRequirementsSnapshot(path); expect(snapshot.content).toBe("# 审核\n\n检查错误。"); expect(snapshot.sha256).toMatch(/^[0-9a-f]{64}$/); expect(snapshot.path).toContain("规则.md"); } finally { await rm(root, { recursive: true, force: true }); } }); });

describe("ReviewRequirementsService", () => {
  it("keeps the selected content until the user explicitly reloads it", async () => {
    const root = await mkdtemp(join(tmpdir(), "review-manager-stored-rules-"));
    const path = join(root, "规则.md");
    let stored: RequirementsSnapshot | undefined;
    const database = {
      saveRequirements(snapshot: RequirementsSnapshot) { stored = snapshot; },
      getRequirements() {
        return stored && { id: "global-default", file_path: stored.path, canonical_path: stored.path, file_name: stored.fileName, last_sha256: stored.sha256, last_size_bytes: stored.sizeBytes, last_loaded_at: stored.loadedAt, content: stored.content, created_at: stored.loadedAt, updated_at: stored.loadedAt };
      },
    };
    const service = new ReviewRequirementsService(database as any);
    try {
      await writeFile(path, "第一版\n");
      await service.configure(path);
      await writeFile(path, "第二版\n");

      expect((await service.loadRequiredSnapshot()).content).toBe("第一版");
      expect((await service.previewCurrent()).preview).toBe("第一版");

      await service.reload();
      expect((await service.loadRequiredSnapshot()).content).toBe("第二版");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
