import type { RequirementsSnapshot, RequirementsStatus } from "../../shared/contracts";
import { RequirementsError } from "../../shared/errors";
import type { Database, RequirementRecord } from "../persistence/Database";
import { readRequirementsSnapshot } from "./requirementsReader";

export class ReviewRequirementsService {
  constructor(private readonly database: Database) {}
  async configure(filePath: string): Promise<RequirementsStatus> { const snap = await readRequirementsSnapshot(filePath); this.database.saveRequirements(snap); return this.toStatus(snap, "valid"); }
  async getStatus(): Promise<RequirementsStatus> {
    const config = this.database.getRequirements();
    if (!config) return { state: "not_configured", message: "开始审核前，请先选择全局默认审核要求文档。" };
    try { return this.toStatus(await this.loadStored(config), "valid"); } catch (error) { return this.errorStatus(config.file_path, error); }
  }
  async reload(): Promise<RequirementsStatus> { const config = this.database.getRequirements(); if (!config) return { state: "not_configured" }; return this.configure(config.file_path); }
  async previewCurrent(): Promise<RequirementsStatus> { const config = this.database.getRequirements(); if (!config) return { state: "not_configured" }; const snap = await this.loadStored(config); return { ...this.toStatus(snap, "valid"), preview: snap.content }; }
  async loadRequiredSnapshot(): Promise<RequirementsSnapshot> { const config = this.database.getRequirements(); if (!config) throw new RequirementsError("requirements_not_configured", "尚未配置全局默认审核要求"); return this.loadStored(config); }
  private async loadStored(config: RequirementRecord): Promise<RequirementsSnapshot> {
    if (config.content !== null) return { path: config.canonical_path, fileName: config.file_name, sha256: config.last_sha256, content: config.content, sizeBytes: config.last_size_bytes, loadedAt: config.last_loaded_at };
    const migrated = await readRequirementsSnapshot(config.file_path);
    this.database.saveRequirements(migrated);
    return migrated;
  }
  private toStatus(s: RequirementsSnapshot, state: "valid" | "changed"): RequirementsStatus { return { state, filePath: s.path, fileName: s.fileName, sha256: s.sha256, sizeBytes: s.sizeBytes, loadedAt: s.loadedAt }; }
  private errorStatus(path: string, error: unknown): RequirementsStatus { const code = error instanceof RequirementsError ? error.code : "requirements_unreadable"; const state = code.includes("missing") ? "missing" : code.includes("empty") ? "empty" : code.includes("too_large") ? "too_large" : code.includes("encoding") ? "invalid_encoding" : "unreadable"; return { state, filePath: path, message: error instanceof Error ? error.message : String(error) }; }
}
