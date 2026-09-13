# Security

- App Server uses stdio only; no listener is opened.
- Electron uses context isolation and disables Node integration in the renderer.
- Git and Codex are launched with argument arrays and explicit working directories, never via a shell.
- Branch switching never uses force, stash, reset, clean, pull, or push.
- Reviews are read-only and approval requests are declined.
- Requirements must be selected through the main-process file dialog, validated as UTF-8 `.md`/`.txt`, and are never silently replaced with cached or built-in text.
- Logs and renderer DTOs do not expose credentials.
