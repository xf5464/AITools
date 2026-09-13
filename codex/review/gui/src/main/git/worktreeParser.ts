import type { WorktreeInfo } from "../../shared/contracts";

export function parseWorktreePorcelain(output: string): WorktreeInfo[] {
  const result: WorktreeInfo[] = [];
  let current: WorktreeInfo | undefined;
  for (const line of output.split(/\r?\n/)) {
    if (line.startsWith("worktree ")) { if (current) result.push(current); current = { path: line.slice(9), bare: false, locked: false, prunable: false }; }
    else if (current && line.startsWith("HEAD ")) current.head = line.slice(5);
    else if (current && line.startsWith("branch refs/heads/")) current.branch = line.slice(18);
    else if (current && line === "bare") current.bare = true;
    else if (current && line.startsWith("locked")) current.locked = true;
    else if (current && line.startsWith("prunable")) current.prunable = true;
  }
  if (current) result.push(current);
  return result;
}
