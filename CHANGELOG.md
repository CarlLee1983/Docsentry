# Changelog

All notable Docsentry changes are recorded here. Release tags follow the
`v{version}` pattern managed by Tagsmith.

## v0.3.0 — 2026-07-23

### Added

- A tag-triggered GitHub Release workflow that verifies the tagged source,
  checks its package version, and generates release notes automatically.
- A safe manual-dispatch path for backfilling a GitHub Release from an existing
  tag.
- `docsentry check --changed <base>` for focused review checks based on the
  local Git merge base, including configured evidence and local-link
  dependencies.
- `schemaExamples[].fenceLabel` for validating only explicitly labelled JSON
  or YAML fences when one document contains multiple structured formats.

### Changed

- Tagsmith now pushes validated release tags to `origin`, triggering the
  GitHub Release workflow without a separate push step.

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
