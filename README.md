# Docsentry

> Verify that repository documentation is supported by the code, configuration,
> schemas, and GitHub Action definitions it describes.

**Status:** v0.2.0 released. The next CI-adoption step is dogfooding against
Tagsmith; see the [changelog](CHANGELOG.md) for release details.

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
npm run tag:next  # preview the next release tag with Tagsmith
```

The current implementation supports `init`, `check`, and `inspect`, along with
local-link, package-script, structured-example, Action-input, and paired-document
checks. See `SPEC.md` for the complete v0.1 contract and remaining refinements.

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

## GitHub Actions

The v0.2 composite Action runs the Docsentry code bundled with the Action
revision, using Node.js 20. A repository workflow can use it as follows:

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: CarlLee1983/Docsentry@v0.2.0
    with:
      config: .docsentry.json
      format: json
```

Leave `config` unset to check every Markdown document without configuration.
The Action never executes commands extracted from documentation.

## Releases

Docsentry uses [`@carllee1983/tagsmith`](https://www.npmjs.com/package/@carllee1983/tagsmith)
to govern its SemVer `v{version}` tags. Review a release with `npm run
release:verify`, preview it with `npm run tag:next`, then create it through
`npx tagsmith create --set-version <version> -m "Release <version>"`. The
`prepublishOnly` hook repeats the release verification before npm publication.
