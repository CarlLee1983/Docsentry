# Docsentry architecture

**Status:** v0.5.0 released; milestone 4 implementation is complete

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
- Invalid Docsentry configuration is an invocation error, not a Finding.
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

## Modules and seams

| Module | Interface responsibility | Implementation responsibility |
| --- | --- | --- |
| Verification engine | Turn one request into one report | Orchestration, rule selection, normalization, ordering |
| Repository reader | Read files and list paths beneath one root | Node filesystem access; an in-memory adapter for tests |
| Document parser | Produce headings, links, commands, and fenced blocks with locations | Markdown AST parsing and source-position recovery |
| Evidence collector | Produce package, schema, and Action facts | Parse `package.json`, JSON Schema, Action metadata, and source-located workflow YAML mappings |
| Rule evaluator | Convert document facts plus evidence into Findings | Link, script, schema, target-scoped Action, and pair comparisons |
| Reporter | Render an already-complete report | Terminal, JSON, and SARIF 2.1.0 formatting |

The Repository reader has a real seam because production code needs a Node
filesystem adapter while unit tests need an in-memory fixture adapter. The
Document parser initially has one implementation; it should not acquire a
public parser-adapter seam until a second document format is actually supported.

## Proposed source layout

```text
src/
  core/
    verify.ts          # VerificationEngine implementation
    finding.ts          # report model and deterministic ordering
    config.ts           # config parsing and validation
    rules/              # sealed registry; pure rule logic where possible
  repository/
    reader.ts           # Repository reader Interface
    node-reader.ts      # production Adapter
    memory-reader.ts    # test Adapter
  documents/
    markdown.ts         # source-located Markdown facts
  evidence/
    package.ts
    structured.ts       # JSON Schema and YAML example evidence
    github-action.ts
  cli/
    index.ts
    check.ts
    init.ts
    inspect.ts
  reporters/
    terminal.ts
    json.ts
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
- GitHub PR annotations may be added after the SARIF report is stable.
