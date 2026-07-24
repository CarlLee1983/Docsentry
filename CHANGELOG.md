# Changelog

All notable Docsentry changes are recorded here. Release tags follow the
`v{version}` pattern managed by Tagsmith.

## v0.10.0 — 2026-07-25

### Added

- `docsentry suggest` drafts the contracts a checkout supports. Each proposal
  names the artifact that justifies it and the findings adopting it would
  report against the current checkout, so a maintainer decides knowing whether
  a contract is already satisfied. Package assertions, Action examples, version
  references, schema examples, document pairs, and path references are
  proposed; enumerations stay hand-written, because proposing one means
  guessing a source pattern and a document section.
- `docsentry init --suggest` writes those proposals as the starter
  configuration, keeping `init`'s refusal to overwrite an existing file.
- The verification engine accepts an already-validated configuration in place
  of a configuration path, which is how a proposal is priced without writing a
  file.

Proposals are drafts addressed to a maintainer: the command reports no finding,
carries no exit status of its own, and never rewrites a committed
configuration. Inference is confined to it, and `check` continues to evaluate
only declared contracts.

## v0.9.0 — 2026-07-25

### Added

- `docsentry check --format github` emits GitHub Actions workflow commands, so
  a pull request shows each finding as an inline annotation at its line and
  column. It writes to standard output and calls no API, so it needs no token
  and the check stays deterministic and offline.
- The composite Action accepts `format: github`, and this repository's own CI
  uses it.

## v0.8.0 — 2026-07-24

### Added

- Enumeration evidence can be a JSON pointer into a structured manifest
  (`values.manifest` and `values.pointer`) instead of a text pattern. A pointer
  to an array contributes its items and a pointer to a mapping contributes its
  keys, so a contract can reach one JSON Schema `enum` or an Action `inputs`
  block without collecting every other list in the file.

## v0.7.0 — 2026-07-24

### Added

- `docsentry baseline` records current findings as suppression counts, and
  `check` reports only findings beyond them. This lets a repository adopt
  Docsentry incrementally without weakening a contract. `check` discovers
  `.docsentry-baseline.json` the way it discovers `.docsentry.json`;
  `--baseline <path>` selects another file and `--no-baseline` ignores one.
- Terminal and JSON reports carry a `suppressed` count when a baseline is
  applied, and the terminal report names how many baseline entries no longer
  match.

- An enumeration contract. `enumerations` compares a documented list of values
  with literals collected from selected source files, reporting
  `DOC_ENUM_UNDOCUMENTED`, `DOC_ENUM_UNKNOWN`, `DOC_ENUM_SOURCE_UNAVAILABLE`,
  and `DOC_ENUM_SECTION_MISSING`. Docsentry applies it to its own rule
  identifier table, which was previously kept in step by hand.
- `pathReferences[].exclude` removes paths from a selection, for a filename
  documentation names as a convention rather than a committed file.

### Fixed

- Path references no longer treat an angle-bracket placeholder such as
  `src/core/models/<name>.ts` as a repository path. Found while adopting the
  contract in the sibling Tagsmith repository, whose contributor guide
  documents a template rather than a file.

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
