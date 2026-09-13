import { describe, expect, it } from "vitest";
import { parseWorktreePorcelain } from "../../src/main/git/worktreeParser";
describe("parseWorktreePorcelain", () => { it("parses occupied branches and flags", () => { expect(parseWorktreePorcelain("worktree C:/repo\nHEAD abc\nbranch refs/heads/main\n\nworktree C:/repo-two\nHEAD def\nbranch refs/heads/feature\nlocked reason\n")).toEqual([{ path: "C:/repo", head: "abc", branch: "main", bare: false, locked: false, prunable: false }, { path: "C:/repo-two", head: "def", branch: "feature", bare: false, locked: true, prunable: false }]); }); });
