import type { AppServerClient } from "../appServer/AppServerClient";
import type { ProtocolAdapter } from "../appServer/ProtocolAdapter";
import type { Database, RepositoryRecord, SessionLinkRecord } from "../persistence/Database";
import type { ReviewModelConfig } from "../../shared/contracts";

export class SessionRegistry {
  constructor(private readonly database: Database, private readonly client: AppServerClient, private readonly protocol: ProtocolAdapter) {}
  async resolve(repository: RepositoryRecord, reviewModel: ReviewModelConfig): Promise<SessionLinkRecord> {
    const existing = this.database.getSessionLink(repository.id);
    if (existing) {
      try { await this.client.request("thread/resume", this.protocol.threadResume(existing.thread_id, repository.canonical_path, reviewModel)); return existing; }
      catch { this.database.deleteSessionLink(repository.id); }
    }
    const name = `[Review Manager] ${repository.display_name}`;
    try {
      const listed = await this.client.request<any>("thread/list", { cwd: repository.canonical_path, sourceKinds: ["appServer"], limit: 100, archived: false });
      const match = listed?.data?.find((thread: any) => thread.cwd?.toLowerCase() === repository.canonical_path.toLowerCase() && thread.name === name);
      if (match) { await this.client.request("thread/resume", this.protocol.threadResume(match.id, repository.canonical_path, reviewModel)); this.database.saveSessionLink(repository.id, match.id, name); return this.database.getSessionLink(repository.id)!; }
    } catch { /* A missing list capability must not prevent creating a GUI-owned thread. */ }
    const thread = await this.client.request<any>("thread/start", this.protocol.threadStart(repository.canonical_path, reviewModel));
    await this.client.request("thread/name/set", { threadId: thread.thread.id, name });
    this.database.saveSessionLink(repository.id, thread.thread.id, name);
    return this.database.getSessionLink(repository.id)!;
  }
  async forget(repositoryId: string) { this.database.deleteSessionLink(repositoryId); }
}
