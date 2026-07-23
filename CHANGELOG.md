# Changelog

All notable Docsentry changes are recorded here. Release tags follow the
`v{version}` pattern managed by Tagsmith.

## v0.2.0 — 2026-07-23

### Added

- A distributable JSON Schema for `.docsentry.json`, including editor
  completion for every current configuration section.
- A composite GitHub Action that builds the pinned Action revision and runs
  Docsentry against the caller's checked-out repository.
- Repository CI that dogfoods the composite Action against Docsentry's own
  documentation contracts.

### Changed

- `docsentry init` adds a `$schema` declaration for the installed package.
- Configuration validation now rejects unknown properties at every level.

## v0.1.0 — 2026-07-23

### Added

- Deterministic Markdown verification for local links, package scripts,
  structured examples, GitHub Action inputs, and paired documents.
- `init`, `check`, and `inspect` CLI commands with terminal and JSON reports.
