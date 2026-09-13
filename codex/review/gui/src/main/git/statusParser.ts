import type { RepositorySnapshot } from "../../shared/contracts";

export interface ParsedStatus { branch: string | null; detached: boolean; head: string; dirty: boolean; staged: number; unstaged: number; untracked: number; ahead: number | null; behind: number | null }

export function parsePorcelainV2(output: string): ParsedStatus {
  let branch: string | null = null;
  let head = "";
  let ahead: number | null = null;
  let behind: number | null = null;
  let staged = 0, unstaged = 0, untracked = 0;
  for (const line of output.split(/\r?\n/)) {
    if (line.startsWith("# branch.head ")) { const value = line.slice(14); branch = value === "(detached)" ? null : value; }
    else if (line.startsWith("# branch.oid ")) head = line.slice(13);
    else if (line.startsWith("# branch.ab ")) { const match = /\+(\d+) -(\d+)/.exec(line); if (match) { ahead = Number(match[1]); behind = Number(match[2]); } }
    else if (line.startsWith("? ")) untracked += 1;
    else if (/^[12u] /.test(line)) { const xy = line.split(" ")[1] ?? ".."; if (xy[0] !== ".") staged += 1; if (xy[1] !== ".") unstaged += 1; }
  }
  return { branch, detached: branch === null, head, dirty: staged + unstaged + untracked > 0, staged, unstaged, untracked, ahead, behind };
}
