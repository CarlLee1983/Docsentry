# Docsentry architecture

**Status:** v0.10.0 released; milestone 7 implementation is complete

## Design decision

Docsentry's public design centres on one deep Module: the verification engine.
Callers give it a repository location, selected documents, and resolved
configuration; they receive one complete report. Parsing Markdown, collecting
evidence, applying rules, ordering findings, and translating parser details
remain inside its Implementation.

```ts
type VerificationRequest = {
  root: string;
  documents?: readonly string[];
  configPath?: string;
  changedPaths?: readonly string[];
};

type VerificationReport = {
  findings: readonly Finding[];
  summary: { errors: number; warnings: number };
};

interface VerificationEngine {
  verify(request: VerificationRequest): Promise<VerificationReport>;
}
```

This Interface is intentionally smaller than a collection of public parser and
rule methods. It gives CLI, CI, and tests leverage without exposing Markdown
AST details or evidence-loading order.

## Interface invariants

- `verify` returns all discoverable Findings rather than failing fast on the
  first validation mismatch.
- Equivalent repository contents and configuration produce the same ordered
  report.
- Findings are ordered by document path, source location, then rule identifier.
- Default verification performs no network I/O and executes no commands.
- The opt-in CLI `--changed <base>` resolves `changedPaths` through a local Git
  diff before invoking the engine; the engine selects direct documents and
  local contract dependencies without exposing Git to rules.
- The Node repository adapter resolves filesystem paths before reading them and
  rejects a symbolic link that points outside the checkout.
- Documented path existence is evaluated against the repository file listing
  rather than the filesystem, so both adapters agree on whether a directory
  reference resolves and ignored build output is never treated as evidence.
- Invalid Docsentry configuration is an invocation error, not a Finding.
- `verify` accepts an already-validated configuration in place of a
  configuration path, so a caller can evaluate a configuration that is not
  committed. This is what lets a proposed contract be costed without writing a
  file. Supplying both a configuration and a path is an invocation error.
- Baseline suppression happens outside the engine, on an already-ordered
  report, so a contract never learns that a finding is suppressed and the
  engine stays deterministic.
- The packaged JSON Schema and runtime validator accept the same configuration
  properties; unknown properties are invocation errors.
- A malformed individual document is reported as a Finding whenever a useful
  source location is available.

## Internal flow

```text
VerificationEngine.verify
  ├─ load and validate .docsentry.json
  ├─ discover Documents (or select changed documents and their dependencies)
  ├─ parse Documents into source-located facts
  ├─ collect local Evidence from repository artifacts
  ├─ evaluate the sealed rule registry
  └─ normalize and return the VerificationReport
```

The rule registry is internal in version 0.1. A plugin Interface would be a
shallow seam before there are real independent rule implementations outside the
package.

Drafting runs beside verification rather than inside it. A detector proposes a
contract; the engine then verifies that contract to price it. Keeping the two
apart is what allows the checking path to remain free of inference: the engine
never learns that a configuration was proposed rather than committed.

## Modules and seams

| Module | Interface responsibility | Implementation responsibility |
| --- | --- | --- |
| Verification engine | Turn one request into one report | Orchestration, rule selection, normalization, ordering |
| Repository reader | Read files and list paths beneath one root | Node filesystem access; an in-memory adapter for tests |
| Document parser | Produce headings, links, commands, fenced blocks, code spans, and directory trees with locations | Markdown AST parsing, ASCII tree parsing, and source-position recovery |
| Evidence collector | Produce package, schema, Action, and literal facts | Parse `package.json`, JSON Schema, Action metadata, source-located workflow YAML mappings, and pattern-matched literals from selected source files |
| Rule evaluator | Convert document facts plus evidence into Findings | Link, script, schema, target-scoped Action, pair, version-reference, path-reference, directory-tree, and enumeration comparisons |
| Contract drafter | Turn a checkout into proposed contracts with their adoption cost | Per-contract detectors, each reusing the recognition its rule uses; costing by differential verification |
| Reporter | Render an already-complete report | Terminal, JSON, SARIF 2.1.0, and GitHub workflow-command formatting |

The Repository reader has a real seam because production code needs a Node
filesystem adapter while unit tests need an in-memory fixture adapter. The
Document parser initially has one implementation; it should not acquire a
public parser-adapter seam until a second document format is actually supported.

## Source layout

Docsentry verifies this tree against its own checkout in `exact` mode, so a
moved, added, or removed source file fails the documentation check.

```text source-layout
src/
  core/
    verify.ts           # VerificationEngine implementation
    finding.ts          # report model and deterministic ordering
    config.ts           # config parsing and validation
    errors.ts           # invocation and repository path errors
    baseline.ts         # suppression snapshot model
    proposal.ts         # proposed contract model and fragment merging
    suggest.ts          # contract drafting and adoption cost
    proposals/          # detectors; each justified by one repository artifact
      package.ts
      action.ts
      version.ts
      structured.ts
      pair.ts
      path.ts
    rules/              # sealed registry; pure rule logic where possible
      link.ts
      package.ts
      structured.ts
      action.ts
      pair.ts
      version.ts
      path.ts
      tree.ts
      enumeration.ts
  repository/
    reader.ts           # Repository reader Interface
    node-reader.ts      # production Adapter
    memory-reader.ts    # test Adapter
    path.ts             # repository-relative path normalization
  documents/
    markdown.ts         # source-located Markdown facts
    commands.ts         # shell command extraction
    location.ts         # character offset to source location
    tree.ts             # ASCII directory tree parsing
  evidence/
    package.ts
    structured.ts       # JSON Schema and YAML example evidence
    github-action.ts
    literals.ts         # textual literal collection from source files
  cli/
    index.ts
    init.ts
    suggest.ts          # contract drafting command and its review output
    inspect.ts
    baseline.ts         # baseline snapshot read and write
    changed-files.ts    # opt-in Git change detection
  reporters/
    terminal.ts
    json.ts
    sarif.ts
    github.ts           # GitHub Actions workflow-command annotations
```

## Test strategy

- **Rule tests:** pure inputs and exact Findings; no disk or CLI dependency.
- **Parser tests:** representative Markdown fixtures with line-location
  assertions.
- **Engine tests:** in-memory repository adapter verifies multi-rule ordering
  and no-fail-fast behaviour.
- **CLI tests:** temporary repositories confirm exit codes and JSON shape.
- **Dogfood integration:** a Tagsmith fixture verifies package, schema, Action,
  and bilingual-document contracts together.

## Deferred design choices

- Markdown parsing uses remark with source positions for headings, links, and
  fenced blocks.
- JSON Schema validation uses Ajv; YAML parsing uses `yaml` with safe,
  non-executing parsing.
- GitHub PR annotations are delivered as a reporter that writes workflow
  commands, rather than as a Checks API integration, so the check needs no
  token and performs no network I/O.
