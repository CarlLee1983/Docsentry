# The checkout boundary is read from the checkout

`src/repository/node-reader.ts` skipped four hard-coded directory names —
`.git`, `node_modules`, `dist`, and `coverage`. Those are this repository's own
`.gitignore` frozen into source, and they describe a Node project. Run against
loop-apidoc, the second repository to adopt Docsentry, the walk descended into
`.venv/`, `.worktrees/`, and `.superpowers/` and treated a vendored skill
document inside a Python virtualenv as a document awaiting verification. Of the
three contracts `suggest` proposed, two were unusable: a document pair pointing
at a README inside a Git worktree, and a path-reference contract spanning 2085
code spans across 169 documents that would have reported 975 findings on its
first run. The boundary is now read from the ignore files the checkout itself
carries.

Reading those files rather than asking Git is the load-bearing part, and a later
reader will want to "fix" it. `git ls-files` and `git check-ignore` are more
accurate, and both would falsify ADR 0002: the reader runs on the default
verification path, so invoking Git there ends the guarantee that a check
performs no command execution, which is what lets Docsentry run against
untrusted input in CI. Parsing files the repository already contains keeps that
guarantee, and it is the better fit for the product's first principle besides —
an ignore file is a local artifact, so the boundary becomes evidence, where a
hard-coded list was an inference about which ecosystem a repository belongs to.

Because the reading has to *be* evidence, agreement with Git is the correctness
bar rather than coverage of the common cases, and it is measured: the
differential harness in `test/repository/node-reader.test.ts` compares the walk
against `git ls-files --others --exclude-standard`. Nested `.gitignore` files
are honoured and outrank the ones enclosing them. `.git/info/exclude` is read
too: it holds rules a checkout carries without committing them, and reading it
is still inert.

Getting there took four rounds of review, and the wrong turn is worth recording
because it is the tempting one. A gitignore library answers "is this path
ignored", which folds in whether an ancestor directory was ignored. That is the
wrong question here: a directory re-included by a nested negation kept being
re-excluded by the very pattern it overruled, and three successive heuristics
aimed at that symptom each broke a different pattern shape — one of them by
silently dropping documents rather than surfacing extra ones, which is the
failure direction that does not announce itself.

The walk does not need that question. It decides one directory at a time and
never descends into an excluded one, so by the time an entry is examined its
whole ancestry is settled and a pattern that matched an ancestor has nothing
left to say. Each pattern is therefore matched against the entry itself, the way
Git's own rules describe: a pattern with no `/` matches the entry's name at any
depth, a pattern containing one matches the path relative to its ignore file, a
trailing `/` restricts it to directories, and within one file the last matching
pattern decides. Trailing blanks and a CRLF carriage return are stripped as Git
strips them, since either would quietly turn `docs/` into something that is
neither a directory pattern nor a name. Under these rules `build/` overruled by
`!build/` simply stops matching the contents, because none of them is named
`build`, and every shape the heuristics broke is matched correctly for the same
structural reason.

Once the rules are applied this way, all that is left to ask of a library is
whether one glob matches one string, which `minimatch` already answers and this
package already depended on for its path contracts. The gitignore library added
for this milestone was removed again, so the boundary costs no new dependency.
A general glob matcher speaks a wider dialect than an ignore file does, so it is
narrowed to Git's: brace expansion and extended globs are switched off, because
`{`, `}`, `+` and `(` are ordinary filename characters to Git, and leaving them
live would both miss the file a pattern names and silently drop files it does
not.

The boundary scopes discovery only. `listFiles` applies it; `exists` and
`readText` do not, so a contract may still name an ignored file as evidence — a
generated schema below an ignored `out/`, for instance. A maintainer's explicit
declaration outranks the walk's heuristics, which is the same principle as
Docsentry never inferring a contract.

Six costs are accepted. An ignore file is not Git's tracking state, so a file
that is untracked *and* unignored is still discovered; measured across this
repository and Tagsmith, that set is currently empty. A vendored checkout is
walked rather than treated as an opaque boundary: recognising one means
reimplementing Git's own repository test, and an approximation of it diverged
from Git on partial and invalid markers, which is worse than a stated gap — a
repository that ignores its vendored checkouts, as loop-apidoc does, is
unaffected. Symlinks are never listed at all, which predates this decision and
diverges from Git for a symlink resolving inside the checkout. A global excludes
file is not read, because it lives outside the checkout and nothing outside the
checkout is evidence. Matching is case-sensitive, which is Git's default and the
behaviour in Linux CI, but a repository that has set `core.ignoreCase` will
disagree; reading that setting means reading Git's configuration, and the value
is not worth the widened surface. This is the one claim here resting on the
matcher's documented default rather than on a differential run, because the
case-folding filesystem the harness runs on cannot hold a fixture that
distinguishes `Build/` from `build/`. And a repository with no ignore file at all is
walked in full, including any `node_modules` it contains — left visible rather
than prevented, because `suggest` prices every proposal, so an unbounded walk
surfaces as an absurd adoption cost instead of failing silently.

**Falsified if:** `src/repository/node-reader.ts` excludes a path for any reason
other than a `.git` boundary, a symlink, or a rule read from an ignore file
inside the checkout; or it reads an ignore file that resolves outside the root;
or `src/repository/reader.ts` grows an evidence-reading method that consults the
ignore boundary.
