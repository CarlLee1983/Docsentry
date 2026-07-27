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

v0.9.0 delivery:

- `check --format github` places each finding as an inline pull request
  annotation, so a reviewer sees a documentation failure next to the line that
  caused it rather than in a job log. It writes workflow commands rather than
  calling the Checks API, keeping verification offline and token-free.

Exit condition: an existing repository can enable Docsentry in CI in one
commit, failing only on documentation that changes afterwards.

## Milestone 7 — contracts a maintainer can adopt without reading the specification — complete in v0.10.0

Milestone 6 removed one adoption obstacle and revealed the next. A repository
can now silence the findings it starts with, but `docsentry init` writes only a
document selector, so every contract that catches real drift is reached by
reading this specification and hand-writing JSON. The sibling Tagsmith
configuration runs to eighty lines and includes two nested JSON pointers. Nobody
writes that on their first day, so a new adopter enables link checking and
stops there.

The obstacle is the cost of declaring a contract, not the cost of running one.

Deliverables:

- A suggestion command that reads a checkout and proposes contracts, each
  justified by the artifact that supports it: a manifest value a document
  already restates, a workflow example that references the repository's own
  Action, a version literal that already equals the manifest version, a
  translated document beside its canonical original, inline code spans that
  already resolve to committed files.
- Each proposal states what adopting it would cost, as the findings it would
  produce against the current checkout. A maintainer decides knowing whether a
  contract is already satisfied or reports drift on the first run.
- Proposals are written for review. A repository with no configuration may
  receive one directly; an existing configuration is never rewritten, because
  silently editing a committed file is the behaviour this product refuses
  everywhere else.
- The suggestion path produces no Finding and carries no exit status of its
  own. It drafts; `check` continues to evaluate only contracts a maintainer has
  declared and committed.

Not included: enumerations. Proposing one requires guessing both a source
pattern and the document section that lists its values, and a wrong guess
produces a contract that looks authoritative while checking the wrong set. The
other contracts can each be justified by an exact match against an artifact
that already exists; an enumeration cannot, so it stays hand-written.

This milestone sits closest to the product's first principle, so the boundary
is stated rather than assumed: a proposal is a draft addressed to a maintainer,
never evidence and never a Finding. Inference is confined to the drafting
command. The checking path remains what it has always been — declared
contracts, local evidence, and nothing inferred.

Delivery:

- Run against the sibling Tagsmith checkout as though it had never adopted
  Docsentry, `suggest` proposes nine contracts. It reconstructs the package
  assertions on the same document the maintainer chose, the Action example
  with a more precise `uses` than the committed configuration carries, and the
  path references. The schema example is reconstructed only in part: the
  correct schema, but a wider document selection and no `fenceLabel`, which
  the proposal's own cost — seven findings — makes visible. It also proposes
  four document pairs the hand-written configuration never declared.
- Dogfooding corrected three detectors before they were trusted. A `/bin`
  assertion was proposed against a pointer that reaches the path a command
  runs rather than its name, so the contract would have failed the moment it
  was adopted; the candidate was removed. A package assertion recognised only
  inline code spans while the rule searches the whole document, so proposals
  landed on a changelog instead of the README that states the same value. Both
  faults were of one kind: a detector that does not recognise evidence the way
  its rule does.

Exit condition: a repository that has never used Docsentry runs one command,
reads the proposals, and commits a configuration that reports real drift
without consulting `SPEC.md`. Measured against the sibling Tagsmith checkout,
the proposals reconstruct its hand-written contracts apart from the
enumeration.

## Milestone 8 — the checkout boundary — complete locally

Milestone 7 removed the cost of declaring a contract and was measured against
one repository. A second adopter shows what that sample hid.

loop-apidoc adopted Docsentry on 2026-07-24, a day before `suggest` shipped. Its
committed configuration is eleven lines holding a document selector and nothing
else — precisely the outcome Milestone 7 opens by describing, now observed
rather than predicted. Run against it, `suggest` proposed three contracts and
two of them were unusable, because the walk had descended into `.venv/`,
`.worktrees/`, and `.superpowers/`: a document pair pointed at a README inside a
Git worktree, and a path-reference contract spanned 2085 code spans across 169
documents at a cost of 975 findings. The repository reader skipped four
hard-coded directory names, which were this project's own `.gitignore` frozen
into source and shaped like a Node project.

The obstacle is that Docsentry did not know which files belong to the checkout
it was checking.

Deliverables:

- The checkout boundary is read from the ignore files a repository carries — its
  `.gitignore` files and its `.git/info/exclude` — with nested files, negation,
  and Git's precedence between them honoured. Docsentry parses those files
  rather than invoking Git, so verification stays inert — see
  [ADR 0008](docs/adr/0008-the-checkout-boundary-is-read-from-the-checkout.md).
- Two boundaries stay structural, because no ignore file declares them: `.git`
  itself, and an ignore file symlinked outside the root, which Git refuses to
  follow and which would otherwise let a committed file apply rules from
  anywhere on the machine.
- The boundary scopes discovery only. A contract may still name an ignored
  artifact as evidence, because an explicit declaration outranks the walk.
  `CONTEXT.md` states that asymmetry in the definitions of Document and
  Evidence.

Not included: cross-ecosystem evidence. Three of the six proposal detectors read
`package.json`, so a Python repository receives no package, version, or schema
proposal at all. That is a real obstacle and a separate one; the measurement
that would scope it is a `suggest` run against a checkout whose boundary is
already correct, which is what this milestone produces.

Delivery:

- Against loop-apidoc, the path-reference proposal falls from 169 documents and
  975 findings to 27 documents and 208, and the worktree document pair
  disappears. No proposal names a path below `.venv/`, `.worktrees/`, or
  `.superpowers/`.
- `check` is unchanged for all three adopters — this repository, Tagsmith, and
  loop-apidoc all still report no findings.
- A differential harness in `test/repository/node-reader.test.ts` compares the
  walk against `git ls-files --others --exclude-standard` over fifty-three
  fixtures. Fifty-two agree; the exception is a vendored checkout, which Git
  treats as opaque and this walk does not, recorded as an accepted cost rather
  than approximated. The suite is a record of what has been checked, not a claim
  that any dimension is cleared: every round of review so far has found a
  failing case smaller than anything already in it.
- Five rounds of review found what the first fixtures did not: a nested negation
  re-included a directory but not its contents, rules symlinked outside the
  checkout were honoured, three successive heuristics aimed at the first of
  those each broke a pattern shape of their own, CRLF endings and byte-order
  marks corrupted patterns, and a general glob matcher expanded brace and
  extended-glob syntax that Git takes literally. The heuristics were abandoned
  for Git's documented matching rules, which need no such bookkeeping. Every
  case now has a test.
- The gitignore library adopted for this milestone was removed again once the
  matching rules were applied directly, so the boundary ships with no new
  dependency.

Accepted costs are recorded in
[ADR 0008](docs/adr/0008-the-checkout-boundary-is-read-from-the-checkout.md); the
one worth restating is that an ignore file is not Git's tracking state, so a
file that is untracked and unignored is still discovered. Measured across this
repository and Tagsmith, that set is currently empty.

Exit condition: a repository that is not a Node project, and that keeps
virtualenvs, worktrees, or vendored tooling on disk, receives proposals naming
only files it actually maintains.

## Resolved decisions

| Decision | Current default | Resolve before |
| --- | --- | --- |
| Package name | `@carllee1983/docsentry` | Resolved in v0.1.0 |
| Minimum Node version | Node.js 20 or later | Resolved in v0.1.0 |
| Config filename | `.docsentry.json` | Resolved for v0.2 |
| Markdown parser | remark with source locations | Resolved in v0.1.0 |
| YAML parser | `yaml` with safe parsing | Resolved in v0.1.0 |
| Warning policy | Warnings are reported but do not fail CI by default | Resolved in v0.1.0 |
