# Docsentry roadmap

## Product principles

- Evidence before inference: report only what a local artifact can establish.
- Deterministic by default: no network and no extracted-command execution.
- Actionable reports: every result points to a document location and names the
  evidence that failed to support it.
- Small Interface, deep implementation: `check` is the maintainer and CI
  entrypoint; internal parsing and rule mechanics remain private.
- Safe adoption: never rewrite a document merely because a check failed.

## Milestone 0 — specification and dogfood fixture — complete

Deliverables:

- Product, architecture, and roadmap documents.
- A proposed `.docsentry.json` for the sibling Tagsmith project.
- A table of expected results against a clean Tagsmith checkout.

Exit condition: the product boundary and first five rules can be explained
without referring to an implementation detail.

## Milestone 1 — deterministic Markdown verifier — complete in v0.1.0

Deliverables:

- TypeScript CLI scaffold with `init`, `check`, and `inspect`.
- Markdown discovery, parsing, and source locations.
- Local link/anchor/asset, package-script, JSON/YAML syntax, schema-example,
  Action-input, and document-pair rules.
- JSON output and fixture-driven tests.

Exit condition: a deliberately broken fixture produces independently testable,
source-located Findings for each rule.

## Milestone 2 — CI adoption — complete

Deliverables:

- Reusable GitHub Action.
- Stable JSON report shape and documented rule identifiers.
- Tagsmith dogfooding in CI.
- Configuration JSON Schema and editor completion.

v0.2.0 delivery:

- The package ships `schema.json`; `docsentry init` points editors to it and
  the runtime rejects unknown configuration properties.
- `action.yml` is a composite Action that builds its pinned source revision,
  then runs `check` in the caller's repository.
- This repository's CI dogfoods that Action, including its documented Action
  example. The sibling Tagsmith repository runs the released v0.4 Action in
  its documentation-governance workflow.

Exit condition: a documentation-only PR can be rejected by CI with a concise,
actionable error report.

## Milestone 3 — focused review workflows — complete locally

Deliverables:

- `check --changed <base>` for PR-scale execution — complete locally.
- SARIF 2.1.0 reporter — complete locally.
- Explicit CLI help contract; `--changed` remains the only opt-in mode that
  invokes a trusted local Git command.

Exit condition: a maintainer can see which changed source or document invalidated
which contract without scanning the full repository report.

## Milestone 4 — precise Action examples — complete in v0.5.0

Deliverables:

- Optional `actionExamples[].uses` configuration to identify the Action whose
  `with:` keys are being documented, independent of its version suffix.
- Unknown Action input findings point to the YAML key's source line and column.
- Backward-compatible validation of every `with:` mapping when `uses` is
  omitted.

Exit condition: a workflow example containing several Actions reports only an
unknown input belonging to the configured Action, at that input's source line.

## Milestone 5 — facts that outlive a release — complete in v0.6.0

Documents restate two kinds of repository fact that no existing contract
covers: the current release version, and the paths of files the repository
actually contains. Both are declared explicitly, so a document keeps its
freedom to mention a historical version or an illustrative path.

Deliverables:

- Declared version references compared against a manifest pointer.
- Declared inline path references, restricted to configured path patterns.
- Declared directory-tree examples compared against the repository, in a
  documented-paths-exist or exact mode.

v0.6.0 delivery:

- This repository enables all three contracts against its own documentation,
  including its `ARCHITECTURE.md` source layout in `exact` mode.
- The v0.6.0 release itself was gated by the new contract: bumping the package
  version reported `DOC_VERSION_STALE` against the documented Action reference
  in `README.md` until it was updated.

Exit condition: a release that changes the package version, and a refactor that
moves a documented file, each fail the documentation check before merge.

## Milestone 6 — incremental adoption — complete in v0.7.0

A repository that adopts Docsentry after its documentation has drifted meets
every existing finding at once, which is the main obstacle to adoption outside
this project.

Deliverables:

- `docsentry baseline` and a `check` that discovers it, matching recorded
  messages before falling back to counts.
- An enumeration contract, so a documented list of values is verified against
  the code that defines it instead of by hand.

v0.7.0 delivery:

- Docsentry verifies its own rule identifier table, which had been maintained
  by hand since v0.1.0. Enabling the contract immediately reported four
  identifiers the table was missing.

v0.8.0 delivery:

- Enumeration evidence accepts a JSON pointer, so a documented list can be
  compared with one enum inside a schema rather than with every literal in a
  file. Adopting the contract in the sibling Tagsmith repository required it.

Exit condition: an existing repository can enable Docsentry in CI in one
commit, failing only on documentation that changes afterwards.

## Resolved decisions

| Decision | Current default | Resolve before |
| --- | --- | --- |
| Package name | `@carllee1983/docsentry` | Resolved in v0.1.0 |
| Minimum Node version | Node.js 20 or later | Resolved in v0.1.0 |
| Config filename | `.docsentry.json` | Resolved for v0.2 |
| Markdown parser | remark with source locations | Resolved in v0.1.0 |
| YAML parser | `yaml` with safe parsing | Resolved in v0.1.0 |
| Warning policy | Warnings are reported but do not fail CI by default | Resolved in v0.1.0 |
