# Repository Guidelines

## Project Structure & Module Organization

Docsentry is a TypeScript CLI. The product documents define the public boundary:

- `README.md` introduces the project and its intended users.
- `SPEC.md` is the authoritative v0.1 behavior and CLI contract.
- `ARCHITECTURE.md` defines module seams and the planned TypeScript layout.
- `ROADMAP.md` records milestones and deferred decisions.
- `examples/tagsmith.docsentry.json` is the dogfooding configuration example.

Place orchestration and rules under `src/core/`, filesystem adapters under
`src/repository/`, parsers under `src/documents/`, evidence readers under
`src/evidence/`, and CLI/reporters in their respective directories. Tests are
in `test/`. Keep the
verification engine as the public deep module; do not expose parser internals
or a rule-plugin API without an approved design change.

## Build, Test, and Development Commands

Use Node.js 20 or later. The common development commands are:

```bash
npm install       # install dependencies
npm test          # execute the Vitest suite
npm run check     # type-check without emitting files
npm run build     # compile TypeScript to dist/
node dist/cli/index.js check --format json
npm run tag:check # validate all release tags through Tagsmith
```

The CLI supports `docsentry init`, `docsentry check [paths...]`, and
`docsentry inspect README.md`. Keep this guide and `README.md` aligned when
scripts change.

## Coding Style & Naming Conventions

Implement in TypeScript. Prefer small, explicit modules with public interfaces
in `PascalCase`, functions and variables in `camelCase`, and files in
`kebab-case` (for example, `node-reader.ts`). Use `readonly` for externally
returned collections and preserve deterministic finding ordering: document
path, source location, then rule ID. Rule identifiers use uppercase snake case,
such as `DOC_LINK_MISSING`.

Keep validation deterministic and local: no network I/O, command execution, or
automatic documentation edits during default verification.

## Testing Guidelines

Add focused Vitest tests alongside the implementation. Cover pure rules with
exact findings, Markdown parsing with source-line assertions, engine behavior
through the in-memory repository adapter, and CLI behavior in temporary
repositories. Include fixtures for malformed documents and multiple findings;
verification must report all discoverable findings rather than fail fast.

## Commit & Pull Request Guidelines

This checkout has no Git metadata, so no existing commit convention can be
derived. Use concise, imperative subjects such as `Add local link validation`.
Keep commits narrowly scoped. Pull requests should explain the affected
contract or rule, list verification performed, link related issues when
available, and include example terminal or JSON output for user-visible report
changes. Update `SPEC.md` and `ARCHITECTURE.md` whenever behavior or module
boundaries change.

## Release Tags

Use the committed `.tagsmith.json` and the local `tagsmith` binary to manage
release tags. Run `npm run tag:next` before a release and create annotated tags
with `npx tagsmith create`; do not create version tags directly with `git tag`.
