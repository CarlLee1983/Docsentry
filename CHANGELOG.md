# Changelog

All notable Docsentry changes are recorded here. Release tags follow the
`v{version}` pattern managed by Tagsmith.

## v0.6.0 — 2026-07-24

### Added

- A version reference contract. `versionReferences` selects documents and a
  literal pattern containing one or more `{version}` placeholders, then
  compares every documented version against a JSON pointer in a local
  manifest. New rules: `DOC_VERSION_STALE`,
  `DOC_VERSION_REFERENCE_MISSING`, and `DOC_VERSION_EVIDENCE_UNAVAILABLE`.
- `check --changed <base>` now selects the documents of a version reference
  whose manifest changed.
- Docsentry dogfoods the contract by requiring its own README to document the
  released Action reference.
- A path reference contract. `pathReferences` declares which inline code spans
  are repository paths through `include` glob patterns, and reports
  `DOC_PATH_MISSING` for a span the repository does not contain. Whitespace,
  glob metacharacters, and bare file extensions keep prose and commands
  outside the contract.
- The Markdown parser now extracts inline code spans with source locations,
  and `docsentry inspect` reports them.
- `check --changed <base>` now selects documents that reference a changed or
  deleted path.
- A directory tree contract. `directoryTrees` compares labelled ASCII trees
  with the repository, in `declared-exists` or `exact` mode, reporting
  `DOC_TREE_PATH_MISSING`, `DOC_TREE_PATH_UNDOCUMENTED`, and
  `DOC_TREE_UNPARSED`. The parser accepts indented and box-drawing trees.
- Docsentry verifies its own `ARCHITECTURE.md` source layout in `exact` mode.

### Fixed

- `ARCHITECTURE.md` documented a `src/cli/check.ts` that does not exist and
  omitted six source files; its tree now matches the checkout and is verified.

## v0.5.0 — 2026-07-23

### Added

- Action example rules can now select one documented `uses:` reference, ignoring
  its `@ref` suffix, and pinpoint an unknown input at its YAML key.

### Changed

- Completed CI adoption by upgrading the Tagsmith documentation-governance
  workflow and its configuration schema reference to Docsentry v0.4.0.
- Docsentry now dogfoods validation of the GitHub Action example in its own
  README.

### Fixed

- Repository reads now reject symbolic links that resolve outside the checkout;
  affected documentation links report `DOC_LINK_OUTSIDE_REPOSITORY`.

## v0.4.0 — 2026-07-23

### Added

- `docsentry check --format sarif`, which renders Findings as a SARIF 2.1.0
  log with source locations, related evidence locations, and suggestions.
- Stable command help through `docsentry --help`, `docsentry help <command>`,
  and command-level `--help` / `-h` aliases.

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
