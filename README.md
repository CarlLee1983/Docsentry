# Docsentry

> Verify that repository documentation is supported by the code, configuration,
> schemas, and GitHub Action definitions it describes.

**Status:** v0.4.0 release candidate. Docsentry is dogfooded in its own CI and
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

The current implementation supports `init`, `check`, and `inspect`, along with
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

## Configuration

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

## GitHub Actions

The v0.3 composite Action runs the Docsentry code bundled with the Action
revision, using Node.js 20. A repository workflow can use it as follows:

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: CarlLee1983/Docsentry@v0.4.0
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
Release` from the Actions page and provide that tag (for example, `v0.4.0`).
The workflow is safe to re-run and never replaces an existing release.
