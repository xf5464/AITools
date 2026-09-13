import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { extname, basename } from "node:path";
import { defaults } from "../config";
import { RequirementsError } from "../../shared/errors";
import type { RequirementsSnapshot } from "../../shared/contracts";
import { normalizeRequirements } from "./requirementsNormalizer";

export async function readRequirementsSnapshot(filePath: string): Promise<RequirementsSnapshot> {
  if (!defaults.reviewRequirements.allowedExtensions.includes(extname(filePath).toLowerCase())) throw new RequirementsError("requirements_extension", "仅支持 .md 和 .txt 审核要求");
  const canonical = await realpath(filePath).catch(() => { throw new RequirementsError("requirements_missing", "审核要求文件不存在"); });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const before = await stat(canonical);
    if (before.size > defaults.reviewRequirements.maxBytes) throw new RequirementsError("requirements_too_large", "审核要求超过 512 KiB");
    let bytes: Buffer;
    try { bytes = await readFile(canonical); } catch { throw new RequirementsError("requirements_unreadable", "无法读取审核要求文件"); }
    const after = await stat(canonical);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) { if (attempt === 0) continue; throw new RequirementsError("requirements_changed_during_read", "读取期间审核要求持续变化"); }
    let content: string;
    try { content = normalizeRequirements(bytes); } catch (error) { if (error instanceof RequirementsError) throw error; throw new RequirementsError("requirements_invalid_encoding", "审核要求不是有效 UTF-8"); }
    const normalizedBytes = Buffer.from(content, "utf8");
    return { path: canonical, fileName: basename(canonical), sha256: createHash("sha256").update(normalizedBytes).digest("hex"), content, sizeBytes: normalizedBytes.byteLength, loadedAt: new Date().toISOString() };
  }
  throw new RequirementsError("requirements_changed_during_read", "无法取得一致的审核要求快照");
}
