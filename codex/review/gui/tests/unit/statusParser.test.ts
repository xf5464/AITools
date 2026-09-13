import { describe, expect, it } from "vitest";
import { parsePorcelainV2 } from "../../src/main/git/statusParser";
describe("parsePorcelainV2", () => {
  it("parses branch, divergence and dirty counts", () => { const result = parsePorcelainV2("# branch.oid abcdef123456\n# branch.head feature/test\n# branch.ab +3 -2\n1 M. N... file.ts\n1 .M N... other.ts\n? new.txt\n"); expect(result).toMatchObject({ branch: "feature/test", head: "abcdef123456", ahead: 3, behind: 2, staged: 1, unstaged: 1, untracked: 1, dirty: true }); });
  it("recognizes detached clean state", () => { expect(parsePorcelainV2("# branch.oid abcdef\n# branch.head (detached)\n")).toMatchObject({ branch: null, detached: true, dirty: false }); });
});
