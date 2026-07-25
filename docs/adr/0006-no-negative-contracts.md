# No negative contracts

Docsentry will not gain a contract that asserts the absence of something — that
no module imports a network client, that a file does not import another. Every
existing contract evaluates a document's claim against a positive artifact: a
script, an input, a schema, a version, a path, a tree, a list of literals.
Absence is a different kind of evidence, and admitting it turns a documentation
verifier into an architecture fitness function, which `SPEC.md` already lists
among the non-goals as arbitrary source-code semantic analysis.

The decisions such a contract would guard are already guarded well enough by
disclosure. `directoryTrees` in `exact` mode makes a second parser impossible to
add without editing `ARCHITECTURE.md`, which puts the decision back in front of
whoever is adding it — verified by planting a second parser file under
`src/documents/` and watching `DOC_TREE_PATH_UNDOCUMENTED` report it. What
matters is that a decision
cannot be reversed silently, not that it cannot be reversed; tools built for
enforcement, such as a dependency linter, remain available where prevention is
genuinely wanted.

The cost is real: conditions expressed as content rather than structure — this
repository performing no network I/O — stay unverifiable, and depend on a
reviewer reading the decision record.

**Falsified if:** a contract in `schema.json` accepts a pattern that must not
match, or a rule under `src/core/rules/` reports a finding for evidence that is
absent rather than mismatched.
