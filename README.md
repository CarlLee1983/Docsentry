# Docsentry

> Verify that repository documentation is supported by the code, configuration,
> schemas, and GitHub Action definitions it describes.

**Status:** v0.9.0 released. Docsentry is dogfooded in its own CI and
in the sibling Tagsmith repository; see the [changelog](CHANGELOG.md) for
release details.

Docsentry is a deterministic CLI and CI tool for maintainers of repositories
with user-facing documentation. It finds documentation drift such as obsolete
commands, invalid configuration snippets, missing local links, and divergent
language editions.

It is deliberately not a prose editor, CMS, web crawler, or release platform.
Its job is to validate verifiable documentation contracts against local
repository evidence.

## First target

The first repository used to validate the product will be the sibling
`Tagsmith` project (`../Tagsmith/`). Its Markdown documentation, JSON Schema,
`package.json`, and `action.yml` provide representative evidence sources.

## Specification map

- [Product specification](SPEC.md) — scope, rules, CLI, configuration, and
  acceptance criteria.
- [Architecture](ARCHITECTURE.md) — module interfaces, seams, and data flow.
- [Roadmap](ROADMAP.md) — staged delivery plan and open decisions.
- [Configuration schema](schema.json) — editor completion and validation for
  `.docsentry.json`.
- [繁體中文操作指南](docs/operations-guide.zh-TW.md) — 從安裝、設定到 CI
  導入的實作步驟。
- [產品介紹頁](docs/promo.html) — 可離線開啟的單頁推廣素材。
- [Changelog](CHANGELOG.md) — release and unreleased change history.
- [Example configuration](examples/tagsmith.docsentry.json) — proposed
  Docsentry configuration for dogfooding against Tagsmith.

## Product promise

For every reported finding, Docsentry must identify the document location, the
failed contract, and the local repository evidence used to evaluate it.

## Development

Use Node.js 20 or later.

```bash
npm install       # install dependencies
npm test          # run the verification fixture tests
npm run check     # type-check without emitting files
npm run build     # compile the CLI to dist/
node dist/cli/index.js check --format json
node dist/cli/index.js check --format sarif > docsentry.sarif
npm run tag:next  # preview the next release tag with Tagsmith
```

The current implementation supports `init`, `check`, `baseline`, and `inspect`, along with
local-link, package-script, structured-example, Action-input, and paired-document
checks. To limit a review to a pull request's affected documentation, use
`docsentry check --changed origin/main`; Docsentry compares the Git merge base
with `HEAD` and checks changed documents plus their local documentation
dependencies. See `SPEC.md` for the complete contract and remaining refinements.

Run `docsentry --help` for the command overview or `docsentry help check` for
the complete `check` option contract. Help is available without reading a
repository or configuration file.

Use `--format sarif` to emit a SARIF 2.1.0 report for a code-scanning
consumer. Paths in the report are repository-relative and source-located; the
command keeps the normal non-zero exit status when it reports errors.

Use `--format github` in a GitHub Actions job to place each finding as an
inline annotation on the pull request:

```text
::error file=README.md,line=12,col=3,title=DOC_SCRIPT_UNKNOWN::Documented script "verify" does not exist.
```

The runner turns these workflow commands into annotations, so Docsentry needs
no token and makes no API call. GitHub displays at most ten annotations per
level per job; the summary line always reports the full counts.

## Configuration

`docsentry suggest` reads a checkout and drafts the contracts its artifacts
support, so a first configuration does not have to be written from the
specification. Each proposal names the artifact that justifies it and the
findings adopting it would report today:

```text
2. documented inputs of CarlLee1983/Docsentry  [actionExamples]
   README.md shows a workflow example using `CarlLee1983/Docsentry`, and this
   repository defines action.yml.
   Adopting it reports nothing against the current checkout.
```

Proposals are drafts. The command reports no findings, writes no file, and
never rewrites an existing configuration — copy what you want to keep. In a
repository with no configuration yet, `docsentry init --suggest` writes the
proposals as the starter file instead. Contracts are checked only once they are
committed.

`docsentry init` creates a minimal `.docsentry.json`. The installed package
ships `schema.json`, so editors can complete and validate the stable
configuration keys:

```json
{
  "$schema": "./node_modules/@carllee1983/docsentry/schema.json",
  "documents": ["README.md", "docs/**/*.md"]
}
```

Unknown configuration keys are rejected before verification starts. Add the
contract-specific sections described in [SPEC.md](SPEC.md) as the repository
needs them.

When one document contains several JSON formats, add a label after the intended
fence language (for example, <code>```json docsentry-config</code>) and set the
same `schemaExamples[].fenceLabel`; unlabeled schema rules continue to validate
every matching JSON or YAML block.

For Action examples that include more than one `uses:` step, set
`actionExamples[].uses` to the Action being documented (for example,
`CarlLee1983/Docsentry`). Docsentry ignores the `@ref` suffix and validates
only that Action's `with:` keys, reporting an unknown key at its exact YAML
line.

To keep a documented release version from outliving its manifest, declare a
version reference. Docsentry matches the literal pattern in each selected
document and compares every `{version}` placeholder against a JSON pointer in a
local manifest:

```json
{
  "versionReferences": [
    {
      "documents": ["README.md"],
      "pattern": "CarlLee1983/Docsentry@v{version}",
      "label": "documented Action reference",
      "required": true
    }
  ]
}
```

`manifest` defaults to `package.json` and `evidence` defaults to `/version`.
A documented version that no longer matches its evidence reports
`DOC_VERSION_STALE` at the version literal itself, so the surrounding literal
text keeps unrelated versions — a changelog history, for example — outside the
contract. Set `required` to report a document that never states the reference
at all.

To keep documented file paths honest through a refactor, declare which inline
code spans are paths:

```json
{
  "pathReferences": [
    {
      "documents": ["ARCHITECTURE.md", "SPEC.md"],
      "include": ["src/**", "test/**"]
    }
  ]
}
```

Only inline code matching `include` is checked, and each candidate resolves
against the repository root rather than against the document. Text containing
whitespace, glob metacharacters, angle-bracket placeholders, or a bare file
extension stays prose, so `npm run build`, `docs/**/*.md`,
`src/models/<name>.ts`, and `.md` are never treated as paths. A missing target
reports `DOC_PATH_MISSING` at the code span. Add `exclude` for a filename the
documentation names as a convention rather than a committed file.

An architecture document that draws its source layout can have that tree
compared with the repository:

```json
{
  "directoryTrees": [
    {
      "documents": ["ARCHITECTURE.md"],
      "fenceLabel": "source-layout",
      "root": "src",
      "mode": "exact"
    }
  ]
}
```

The parser accepts indented and box-drawing trees and strips trailing `#`
comments. `declared-exists`, the default, reports `DOC_TREE_PATH_MISSING` for a
documented path that no longer exists. `exact` also reports
`DOC_TREE_PATH_UNDOCUMENTED` for a repository file the tree omits; a directory
listed without children covers everything beneath it, and `ignore` excludes
generated files. A line the parser cannot place reports `DOC_TREE_UNPARSED` as
a warning instead of being dropped.

A document that lists a closed set — rule identifiers, error codes, supported
values — can be compared with the code that defines it:

```json
{
  "enumerations": [
    {
      "documents": ["SPEC.md"],
      "label": "rule identifier",
      "values": { "sources": ["src/core/rules/*.ts"], "pattern": "\"(DOC_[A-Z_]+)\"" },
      "documented": { "pattern": "DOC_[A-Z_]+", "section": "Rule identifiers" }
    }
  ]
}
```

The documented set is every inline code span matching `documented.pattern` in
full, optionally limited to one section. A value missing from the document
reports `DOC_ENUM_UNDOCUMENTED`; a documented value the code does not define
reports `DOC_ENUM_UNKNOWN` at its code span.

When the values are already published in a structured file, point at them
instead of matching text:

```json
{
  "enumerations": [
    {
      "documents": ["README.md"],
      "label": "diagnostic code",
      "values": { "manifest": "json-output.schema.json", "pointer": "/definitions/diagnosticCode/enum" },
      "documented": { "pattern": "[a-z][a-z0-9-]+", "section": "Diagnostic codes" }
    }
  ]
}
```

A pointer to an array contributes its items; a pointer to a mapping
contributes its keys, which reaches an Action `inputs` block. Textual
collection does not parse the source language, so a value in a comment still
counts; pointer collection is exact. Docsentry uses the textual form on its own
rule identifier table in [SPEC.md](SPEC.md).

## Baseline

A repository whose documentation has already drifted does not have to fix
everything before enabling Docsentry. Record the current findings once, then
check against that record:

```bash
docsentry baseline   # writes .docsentry-baseline.json
docsentry check      # applies it automatically; reports only new findings
```

`check` applies `.docsentry-baseline.json` when it exists, the same way it
reads `.docsentry.json`. Use `--baseline <path>` for a different location and
`--no-baseline` to see every finding again.

A baseline stores a count per document and rule identifier, so it survives
edits that move a line and message wording that changes between releases. A
suppressed finding does not affect the exit status, and the summary reports how
many were suppressed. When entries stop matching, the report says so and
recommends re-running `docsentry baseline`; nothing is rewritten during a
check.

## GitHub Actions

The composite Action runs the Docsentry code bundled with the Action revision,
using Node.js 20. A repository workflow can use it as follows:

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: CarlLee1983/Docsentry@v0.9.0
    with:
      config: .docsentry.json
      format: json
```

Leave `config` unset to check every Markdown document without configuration.
`format` accepts `terminal`, `json`, or `sarif`. The Action never executes
commands extracted from documentation.

## Releases

Docsentry uses [`@carllee1983/tagsmith`](https://www.npmjs.com/package/@carllee1983/tagsmith)
to govern its SemVer `v{version}` tags. Review a release with `npm run
release:verify`, preview it with `npm run tag:next`, then create it through
`npx tagsmith create --set-version <version> -m "Release <version>"`.
Tagsmith pushes the validated tag to `origin`; the `Publish GitHub Release`
workflow then re-verifies that tag, confirms it matches `package.json`, and
creates the GitHub Release with generated notes. npm publication remains a
separate, deliberate step, guarded by `prepublishOnly`.

To backfill a GitHub Release for an already-pushed tag, run `Publish GitHub
Release` from the Actions page and provide that tag (for example, `v0.5.0`).
The workflow is safe to re-run and never replaces an existing release.
