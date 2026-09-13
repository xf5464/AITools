# Codex Review Manager

Windows-first Electron application dashboard for safe, read-only Codex reviews across multiple local Git directories.

## Run

```powershell
npm install
npm test
npm run build
npm start
```

The build regenerates App Server TypeScript and JSON schema from the locally installed Codex CLI. On first launch, select the global review-requirements document, then add Git directories. Reviews do not fetch, pull, switch with force, or modify code.

Phase 0A evidence is saved in `docs/phase-0a-report.json`. Probe-created threads are intentionally retained; the tool does not archive or delete them.
