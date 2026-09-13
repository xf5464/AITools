# Phase 2 validation

- App Server lifecycle and JSON-RPC stdio peer: implemented.
- One canonical directory to one persistent GUI-owned thread: implemented.
- Requirements are reloaded at actual execution, snapshotted to SQLite, and embedded verbatim in every review request.
- Local schema compatibility: custom review target selected because schema `0.153.4` does not allow extra instructions on other target variants.
- Read-only sandbox and `never` approval policy: implemented; server approval requests are declined.
- Streaming output, final exited-review item, interrupt, and persistence: implemented.

Protocol probe passed ordinary turn streaming, two different requirements markers in consecutive reviews on the same thread, and restart/resume.
