export const defaults = {
  appServer: { startupTimeoutMs: 15_000, requestTimeoutMs: 30_000, maxRestartAttempts: 3 },
  reviews: { globalConcurrency: 1, delivery: "inline" as const, sandbox: "readOnly" as const, approvalPolicy: "never" as const, defaultTarget: "baseBranch" as const },
  reviewRequirements: { required: true, maxBytes: 524_288, allowedExtensions: [".md", ".txt"], reloadAtRunStart: false, snapshotEachRun: true, allowBypass: false },
  git: { autoFetch: false, autoPull: false, allowForceSwitch: false, refreshIntervalMs: 5_000 },
  sidebarBridge: { enabled: false, experimental: true },
};
