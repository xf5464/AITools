import { describe, expect, it } from "vitest";
import { inferBaseBranch, resolveBaseBranch, resolveConfiguredBaseBranch } from "../../src/main/git/baseBranch";

const branch = (name: string) => ({ name, fullName: `refs/heads/${name}`, remote: name.includes("/"), current: false });
describe("inferBaseBranch", () => {
  it("prefers origin/main and never chooses the current branch", () => { expect(inferBaseBranch([branch("main"), branch("origin/main")], "feature")).toBe("origin/main"); expect(inferBaseBranch([branch("main"), branch("feature")], "feature")).toBe("main"); expect(inferBaseBranch([branch("main")], "main")).toBeUndefined(); });
  it("uses a configured default when available and falls back when missing", () => { expect(inferBaseBranch([branch("main"), branch("master")], "feature", "master")).toBe("master"); expect(inferBaseBranch([branch("main")], "feature", "origin/master")).toBe("main"); });
  it("keeps a valid row override but replaces stale or current selections", () => { expect(resolveBaseBranch("release", [branch("main"), branch("release")], "feature", "main")).toBe("release"); expect(resolveBaseBranch("feature", [branch("main"), branch("feature")], "feature", "main")).toBe("main"); expect(resolveBaseBranch("missing", [branch("main")], "feature", "auto")).toBe("main"); });
  it("uses only the globally configured comparison branch when explicit", () => { expect(resolveConfiguredBaseBranch([branch("main"), branch("origin/main")], "feature", "origin/main")).toBe("origin/main"); expect(resolveConfiguredBaseBranch([branch("main")], "feature", "origin/main")).toBeUndefined(); expect(resolveConfiguredBaseBranch([branch("main")], "main", "main")).toBeUndefined(); });
});
