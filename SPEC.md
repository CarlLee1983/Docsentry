# Docsentry product specification

**Status:** Draft 0.1  
**Last updated:** 2026-07-23

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
- GitHub Action input validation between Markdown examples and a local
  `action.yml` / `action.yaml` file.
- Structural comparison of explicitly paired Markdown documents: headings,
  commands, and fenced code blocks.
- Terminal and JSON reports with non-zero exit status when error findings exist.

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
It does not execute a workflow or validate GitHub expressions in v0.1.

### Document-pair contract

For an explicit canonical/mirror pair, Docsentry compares selected normalized
structures:

- Heading paths; prose wording may differ.
- Shell command code blocks; command text must match exactly after whitespace
  normalization.
- JSON and YAML code blocks; parsed values must match where parseable.

Maintainers can choose a subset of these comparisons per pair.

## Configuration

The proposed configuration filename is `.docsentry.json`. Configuration is
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
      "schema": "schema.json"
    }
  ],
  "actionExamples": [
    {
      "documents": ["README.md"],
      "action": "action.yml"
    }
  ],
  "documentPairs": [
    {
      "canonical": "README.md",
      "mirror": "docs/README.zh-TW.md",
      "requireSame": ["headings", "commands", "codeBlocks"]
    }
  ]
}
```

The schema and exact glob semantics must be implemented before the format is
called stable. Until then this is an intentional design contract, not a
published compatibility guarantee.

## Command interface

The initial CLI surface stays small:

```bash
docsentry init
docsentry check [paths...]
docsentry check --config .docsentry.json --format json
docsentry inspect README.md
```

`check` is the primary Module interface for maintainers and CI. It evaluates
all applicable rules and returns every Finding; it must not stop at the first
failure. `inspect` is a diagnostic command that shows the extracted links,
commands, code blocks, and headings for one Document without passing judgment.

Planned but not part of v0.1:

```bash
docsentry check --changed origin/main
docsentry check --format sarif
```

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

