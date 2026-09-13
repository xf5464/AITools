# Troubleshooting

- **Codex connection failed:** verify `codex --version` works and sign in using the official Codex flow.
- **Schema mismatch:** run `npm run generate:schema`, rebuild, and inspect `docs/phase-0a-report.json`.
- **Review blocked:** select a readable, non-empty UTF-8 Markdown or text requirements file smaller than 512 KiB.
- **Branch switch blocked:** finish the active review, clean the worktree, finish any merge/rebase/cherry-pick/bisect, and ensure another worktree does not occupy the target branch.
- **Account usage unavailable:** the current authentication backend may not provide it; this is not treated as zero.
