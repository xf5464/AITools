# Phase 3 validation

- Token cumulative snapshots are deduplicated, reset into a new epoch, and persisted.
- Run, repository, manager, daily GUI, and account-window scopes are displayed separately.
- Account usage unsupported/error states are not shown as zero.
- Active runs are marked for recovery on startup; inconclusive old turns retain partial output.
- Git state is rescanned after completion and changed results are marked stale.
- Historical requirement text is read from the immutable run snapshot, not the current source file.

Production TypeScript, main/preload bundle, and renderer build passed.
