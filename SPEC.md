# Docsentry product specification

**Status:** v0.6.0 released; milestone 5 implementation is complete

**Last updated:** 2026-07-24

## Problem

Repository documentation is executable in a practical sense: readers copy its
commands, settings, file paths, and Action examples. Code evolves faster than
those documents, so a repository can be green in tests while its documented
onboarding path is broken.

Markdown linters catch formatting problems. Docsentry verifies a narrower and
more consequential question: whether a document's machine-verifiable claims
are supported by evidence in the checked-out repository.

## Product promise

Docsentry evaluates declared documentation contracts against local repository
evidence and reports each mismatch with a stable rule identifier, a source
location, and an explanation. It makes no claim to prove arbitrary natural
language true.

## Users and jobs

| User | Job | Success outcome |
| --- | --- | --- |
| Package or CLI maintainer | Keep installation and command examples usable | A changed script or option cannot silently leave stale docs behind |
| Action maintainer | Keep workflow examples aligned to action metadata | Every documented input exists and uses a valid value shape |
| Repository maintainer | Keep configuration examples valid | A schema change identifies every affected document before merge |
| Multilingual documentation maintainer | Keep editions equally complete | Required headings, commands, and code examples do not diverge |

## Scope

### Version 0.1 supports

- Markdown (`.md`) documents selected by explicit paths or glob patterns.
- Local Markdown links, anchors, and repository-relative assets.
- `package.json` evidence: package name, `engines.node`, `bin`, and scripts.
- JSON and YAML fenced code blocks, including JSON Schema validation when a
  configuration declares a schema.
- GitHub Action input validation between Markdown workflow examples and a local
  `action.yml` / `action.yaml` file, optionally scoped to one documented
  `uses:` reference.
- Structural comparison of explicitly paired Markdown documents: headings,
  commands, and fenced code blocks.
- Declared version references, compared against a version value read from a
  local JSON manifest.
- Declared inline path references, compared against the repository file
  listing.
- Declared ASCII directory trees, compared against the repository in a
  documented-paths-exist or exact mode.
- Terminal, JSON, and SARIF 2.1.0 reports with non-zero exit status when error
  findings exist.

### Explicit non-goals for version 0.1

- Grammar, spelling, style, translation-quality, or SEO scoring.
- Browser rendering, remote URL checks, or external network access.
- Executing commands extracted from documents.
- Editing documentation automatically.
- MDX, HTML, Word, PDF, OpenAPI, and arbitrary source-code semantic analysis.
- A public rule-plugin interface.

These exclusions keep the first release deterministic, safe in CI, and clear
about the evidence it can evaluate.

## Ubiquitous language

| Term | Meaning |
| --- | --- |
| **Document** | One selected Markdown file, parsed with source locations. |
| **Evidence** | A repository fact read from a local artifact, such as a script in `package.json` or an Action input in `action.yml`. |
| **Contract** | A declared relationship that Docsentry can verify between a Document and Evidence. |
| **Rule** | Deterministic logic that evaluates one kind of Contract. Rules own stable identifiers such as `DOC_SCRIPT_UNKNOWN`. |
| **Finding** | A rule result that requires maintainer attention. It includes severity, document location, evidence location when available, and remediation text. |
| **Canonical document** | The reference document in a language pair. It determines required structure; it is not assumed to be a better translation. |
| **Mirror document** | The paired document expected to retain selected contracts from its canonical document. |

## Initial contracts

### Local link contract

For every local Markdown link or repository-relative asset reference:

- The target file must exist.
- A path that resolves outside the checkout through a symbolic link is outside
  the contract and reports `DOC_LINK_OUTSIDE_REPOSITORY`.
- A same-document or Markdown-file fragment must resolve to a heading anchor.
- External URLs are outside the contract in v0.1.

Example finding:

```text
README.md:146  DOC_LINK_MISSING
Target "docs/setup.md" does not exist.
```

### Package command contract

For a documented package-manager command whose command head is `npm run`,
`pnpm run`, or `yarn run`:

- Its named script must exist in the configured `package.json`.
- The report must identify the manifest path and the missing script name.

Docsentry validates availability, not a command's behaviour or output.

### Package identity contract

Configured document assertions may require a literal package name, Node engine,
or CLI bin name to equal the value in `package.json`.

This handles user-visible facts that cannot be inferred reliably from prose.
For example, a configuration may assert that `README.md` documents the package
name `@carllee1983/tagsmith` and evidence it from `/name`.

### Schema example contract

A configuration can select fenced JSON or YAML examples and validate each
complete example against a local JSON Schema. Partial snippets are excluded by
default; a later release may introduce an explicit fragment mode.

Malformed JSON or YAML is itself a finding, even without a schema.

### GitHub Action example contract

For a configured Action definition, Docsentry extracts `with:` keys from YAML
workflow examples and checks that every key is present in the Action's `inputs`.
An `actionExamples[].uses` value scopes the check to matching `uses:` mappings;
the reference suffix after `@` is ignored, so `CarlLee1983/Docsentry` matches
`CarlLee1983/Docsentry@v0.5.0`. Omitting `uses` preserves the original behavior
of checking every `with:` mapping in the selected examples. Findings identify
the unknown YAML key rather than only the enclosing code block. Docsentry does
not execute a workflow or validate GitHub expressions in v0.1.

### Document-pair contract

For an explicit canonical/mirror pair, Docsentry compares selected normalized
structures:

- Heading paths; prose wording may differ.
- Shell command code blocks; command text must match exactly after whitespace
  normalization.
- JSON and YAML code blocks; parsed values must match where parseable.

Maintainers can choose a subset of these comparisons per pair.

### Version reference contract

Documents restate release versions in install commands, Action references, and
schema URLs. A release changes the manifest but cannot change those documents,
so the contract compares them against the manifest instead of against a value
repeated in the configuration.

A version reference declares a literal `pattern` containing one or more
`{version}` placeholders. Docsentry matches that pattern anywhere in each
selected document, including inside fenced code blocks, and compares every
matched version against a JSON pointer in a local manifest:

- Each placeholder matches one SemVer version, including an optional
  prerelease or build suffix.
- The surrounding literal text must match exactly, which keeps unrelated
  version literals — historical entries in a changelog, for example — outside
  the contract.
- A documented version that differs from its evidence reports
  `DOC_VERSION_STALE` at the version literal's own line and column.
- `required: true` reports `DOC_VERSION_REFERENCE_MISSING` when a selected
  document never states the pattern.
- An unreadable manifest or an absent pointer reports
  `DOC_VERSION_EVIDENCE_UNAVAILABLE` at each documented reference, because the
  claim cannot be evaluated rather than because it is wrong.

`manifest` defaults to `package.json` and `evidence` defaults to `/version`, so
the common case declares only `documents` and `pattern`. This contract governs
version literals a maintainer has declared; it makes no attempt to discover
version-like text on its own.

### Path reference contract

Documents name repository files in inline code spans, and a refactor that moves
a file leaves those names behind. A path reference declares which inline code
spans are paths through `include`, a list of repository-relative glob patterns.
Docsentry checks only the spans that match:

- A candidate is resolved against the repository root, not against the document
  that mentions it, because inline prose names a file rather than links to it.
- A candidate exists when the repository contains that file, or contains any
  file beneath it when the candidate names a directory.
- A missing candidate reports `DOC_PATH_MISSING` at the code span.

Several kinds of inline code never become candidates, so ordinary prose and
commands stay outside the contract: text containing whitespace (`npm run
build`), text containing glob metacharacters (`docs/**/*.md`), a placeholder
template in angle brackets (`src/models/<name>.ts`), a bare file extension
(`.md`), and a path that leaves the checkout (`../Tagsmith/`). A
consequence of the extension rule is that an extensionless dotfile such as
`.gitignore` is also excluded; the contract prefers a missed check to a false
report.

Existence is evaluated against the repository file listing, which excludes
build output and dependency directories. A document that names a generated
path should not select it through `include`.

### Directory tree contract

An architecture document often draws the source layout as an ASCII tree, which
drifts as soon as a file moves. A directory tree contract selects fenced blocks
by `fenceLabel` and compares their entries with the repository.

The parser accepts indentation and box-drawing branches (`├──`, `└──`, `│`),
inferring the indentation unit from the first indented entry. A trailing
comment introduced by whitespace and `#` is removed, and an entry ending in `/`
is a directory. A line that cannot be placed — inconsistent indentation, a
skipped level, or an entry that is not a single path segment — reports
`DOC_TREE_UNPARSED` as a warning rather than being silently dropped.

Entries resolve beneath the configured `root`, which the tree's own first line
may restate. Two comparison modes are available:

- `declared-exists`, the default, reports `DOC_TREE_PATH_MISSING` for a
  documented path the repository does not contain.
- `exact` additionally reports `DOC_TREE_PATH_UNDOCUMENTED` for a repository
  file below `root` that the tree omits. A directory listed without children
  covers every file beneath it, so a tree can summarise a subtree instead of
  enumerating it, and `ignore` patterns exclude generated files.

## Configuration

The configuration filename is `.docsentry.json`. Configuration is
optional for basic document discovery and link parsing, but required for
schema, Action, package-identity, and document-pair contracts.

```json
{
  "$schema": "./node_modules/@carllee1983/docsentry/schema.json",
  "documents": ["README.md", "docs/**/*.md"],
  "package": {
    "manifest": "package.json",
    "assertions": [
      {
        "document": "README.md",
        "label": "published package name",
        "value": "@carllee1983/tagsmith",
        "evidence": "/name"
      }
    ]
  },
  "schemaExamples": [
    {
      "documents": ["README.md", "docs/**/*.md"],
      "language": "json",
      "schema": "schema.json",
      "fenceLabel": "docsentry-config"
    }
  ],
  "actionExamples": [
    {
      "documents": ["README.md"],
      "action": "action.yml",
      "uses": "CarlLee1983/Docsentry"
    }
  ],
  "documentPairs": [
    {
      "canonical": "README.md",
      "mirror": "docs/README.zh-TW.md",
      "requireSame": ["headings", "commands", "codeBlocks"]
    }
  ],
  "versionReferences": [
    {
      "documents": ["README.md"],
      "pattern": "CarlLee1983/Docsentry@v{version}",
      "label": "documented Action reference",
      "required": true
    }
  ],
  "pathReferences": [
    {
      "documents": ["ARCHITECTURE.md"],
      "include": ["src/**", "test/**"]
    }
  ],
  "directoryTrees": [
    {
      "documents": ["ARCHITECTURE.md"],
      "fenceLabel": "source-layout",
      "root": "src",
      "mode": "exact",
      "ignore": ["**/*.generated.ts"]
    }
  ]
}
```

`schema.json` is distributed at the package root and provides editor completion
for this format. Runtime configuration validation accepts `$schema` and rejects
unknown properties at every configuration level. Glob matching uses
[`minimatch`](https://github.com/isaacs/minimatch) against repository-relative
paths. A schema example can set `fenceLabel` to validate only fenced blocks
whose metadata contains that whitespace-separated label, such as
<code>```json docsentry-config</code>. Omit it to preserve the default of
validating every matching document and language pair.

An Action example can set `uses` to the owner/repository or local Action
reference shown in its workflow examples. Docsentry compares the reference
without its `@ref` suffix and validates only that Action's `with:` mapping.
Omit `uses` only when every `with:` mapping in the selected YAML examples is
intended for the configured Action.

A version reference `pattern` is literal text apart from its `{version}`
placeholders; Docsentry escapes the literal part, so characters such as `.`,
`@`, and `/` match themselves. A configuration that omits `manifest` reads
`package.json`, and one that omits `evidence` reads the `/version` pointer.

## Command interface

The initial CLI surface stays small:

```bash
docsentry --help
docsentry help check
docsentry init
docsentry check [paths...]
docsentry check --config .docsentry.json --format json
docsentry check --format sarif
docsentry check --changed origin/main
docsentry inspect README.md
```

`check` is the primary Module interface for maintainers and CI. It evaluates
all applicable rules and returns every Finding; it must not stop at the first
failure. `inspect` is a diagnostic command that shows the extracted links,
commands, code blocks, code spans, and headings for one Document without
passing judgment.
`docsentry --help` and `docsentry help <command>` return usage text with status
zero and do not read repository files. The `--help` and `-h` aliases are also
accepted immediately after each command.

`--changed <base>` is an opt-in focused-review mode. It obtains local paths
from `git diff <base>...HEAD`, including deletions, and cannot be combined with
explicit document paths. It checks changed Markdown documents and also selects
documents affected by a changed configuration, package manifest,
version-reference manifest, schema, Action definition, paired document,
local-link target, referenced path, or file below a documented tree root. This is the only current
mode that invokes a trusted Git command; it never executes commands extracted
from documentation.

## Report contract

Every Finding must include:

```ts
type Finding = {
  rule: string;
  severity: "error" | "warning";
  message: string;
  document: { path: string; line: number; column: number };
  evidence?: { path: string; pointer?: string; line?: number };
  suggestion?: string;
};
```

JSON output must contain a `findings` array and a summary of error and warning
counts. Rule identifiers are a compatibility surface once released.

`--format sarif` emits a SARIF 2.1.0 log. Each Finding becomes one result with
its rule ID, severity, message, and repository-relative document location.
When present, evidence is rendered as a related location and the suggested
remediation is retained in the result properties. This lets code-scanning
consumers surface Docsentry diagnostics without losing the normal terminal or
JSON interfaces.

### Rule identifiers

| Contract | Rule identifiers |
| --- | --- |
| Local links | `DOC_LINK_OUTSIDE_REPOSITORY`, `DOC_LINK_MISSING`, `DOC_LINK_ANCHOR_MISSING` |
| Package contracts | `DOC_PACKAGE_MISSING`, `DOC_SCRIPT_UNKNOWN`, `DOC_PACKAGE_ASSERTION_DOCUMENT_MISSING`, `DOC_PACKAGE_ASSERTION_MISSING`, `DOC_PACKAGE_ASSERTION_MISMATCH` |
| Structured examples | `DOC_EXAMPLE_PARSE`, `DOC_SCHEMA_UNAVAILABLE`, `DOC_SCHEMA_INVALID` |
| Action examples | `DOC_ACTION_UNAVAILABLE`, `DOC_ACTION_INPUT_UNKNOWN` |
| Document pairs | `DOC_PAIR_DOCUMENT_MISSING`, `DOC_PAIR_HEADINGS_MISMATCH`, `DOC_PAIR_COMMAND_MISMATCH`, `DOC_PAIR_CODE_BLOCK_MISMATCH` |
| Version references | `DOC_VERSION_STALE`, `DOC_VERSION_REFERENCE_MISSING`, `DOC_VERSION_EVIDENCE_UNAVAILABLE` |
| Path references | `DOC_PATH_MISSING` |
| Directory trees | `DOC_TREE_PATH_MISSING`, `DOC_TREE_PATH_UNDOCUMENTED`, `DOC_TREE_UNPARSED` |

## Acceptance criteria for the first usable release

1. A fixture repository with a missing local link, removed package script,
   invalid JSON example, invalid Action input, and mismatched mirror command
   produces five independently addressable Findings.
2. The same checkout and configuration produce equivalent Findings in terminal
   and JSON modes, apart from presentation.
3. The default check performs no network request and executes no documentation
   command.
4. Findings point to the relevant Markdown source line.
5. A valid Tagsmith checkout can be configured as a dogfood fixture and checked
   in CI.
