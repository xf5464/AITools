import type { BranchInfo } from "../../shared/contracts";

export function inferBaseBranch(branches: BranchInfo[], currentBranch: string | null, preferred = "auto"): string | undefined {
  const names = new Set(branches.map((branch) => branch.name));
  if (preferred !== "auto" && preferred !== currentBranch && names.has(preferred)) return preferred;
  return ["origin/main", "origin/master", "main", "master"].find((candidate) => candidate !== currentBranch && names.has(candidate));
}

export function resolveBaseBranch(saved: string | null, branches: BranchInfo[], currentBranch: string | null, preferred = "auto"): string | undefined {
  if (saved && saved !== currentBranch && branches.some((branch) => branch.name === saved)) return saved;
  return inferBaseBranch(branches, currentBranch, preferred);
}

export function resolveConfiguredBaseBranch(branches: BranchInfo[], currentBranch: string | null, configured: string): string | undefined {
  if (configured === "auto") return inferBaseBranch(branches, currentBranch);
  return configured !== currentBranch && branches.some((branch) => branch.name === configured) ? configured : undefined;
}
