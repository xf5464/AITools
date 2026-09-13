# Architecture

The Electron main process owns Git, SQLite, filesystem access, and the `codex app-server` stdio child. The isolated renderer receives validated DTOs through a narrow preload bridge. A canonical Git root maps to one persistent App Server thread. Every review reloads the configured requirements file at execution time and stores the exact normalized text and SHA-256 in `review_runs` before sending it.

The local Codex `0.153.4` schema only accepts instructions on a custom review target. `ProtocolAdapter` therefore creates a custom target containing the selected range, branch, base, starting HEAD, canonical cwd, and immutable requirements snapshot. Review turns use `approvalPolicy: never` and a read-only sandbox.
