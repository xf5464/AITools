# Compatibility report

## Official App Server path

- Codex CLI: `0.153.4`
- Platform: Windows x86_64
- Transport: JSON-RPC over stdio
- Schema SHA-256: `d3eace08be5dca386bfd1f1e8df650058b4113f1e10870a284d775d75517576a`
- Phase 0A: passed on 2026-09-12
- Requirements injection: `review/start` with a `custom` target containing the concrete review scope and full requirements snapshot
- Account usage: supported during the successful probe
- Thread recovery after App Server restart: passed

The generated schema does not permit supplemental instructions on `baseBranch`, `commit`, or `uncommittedChanges` targets. The adapter therefore uses a custom review target; it does not guess unsupported fields.

## Desktop sidebar bridge

Status: **not tested / disabled**.

The experiment requires a user-created desktop task with an exact title and canonical cwd plus manual verification after a desktop restart. It is not an App Server guarantee and is not part of the production flow. `sidebarBridge.enabled` remains `false`.
