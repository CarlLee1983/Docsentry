# Docsentry

Docsentry verifies that a repository's documentation is supported by the code,
configuration, schemas, and Action definitions it describes. This glossary fixes
the vocabulary for that domain: what is being checked, what it is checked
against, and what comes out.

## Language

### What is checked

**Document**:
One selected Markdown file, parsed with source locations.
_Avoid_: page, article, file

**Drift**:
The condition where a Document's machine-verifiable claims are no longer
supported by the checkout it describes.
_Avoid_: staleness, rot, desync

### What it is checked against

**Evidence**:
A repository fact read from a local artifact — a script in `package.json`, an
input in `action.yml`, a value at a JSON pointer.
_Avoid_: source of truth, ground truth, data

**Checkout**:
The repository state on disk that a verification run is evaluated against.
Nothing outside it is Evidence.
_Avoid_: workspace, project, working copy

### The relationship between them

**Contract**:
A declared, verifiable relationship between a Document and Evidence. A Contract
is declared by a maintainer in configuration; Docsentry never infers one during
verification.
_Avoid_: assertion, check, constraint, expectation

**Rule**:
Deterministic logic that evaluates one kind of Contract. Rules own stable
identifiers such as `DOC_SCRIPT_UNKNOWN`.
_Avoid_: validator, linter, checker

**Canonical document**:
The reference Document in a pair. It determines required structure; it is not
assumed to be the better-written edition.
_Avoid_: original, source document, primary

**Mirror document**:
The paired Document expected to retain selected Contracts from its Canonical
document.
_Avoid_: translation, copy, secondary

### What comes out

**Finding**:
A Rule result that requires maintainer attention. It carries a severity, a
Document location, an Evidence location where one exists, and remediation text.
_Avoid_: error, violation, issue, warning

**Invocation error**:
A failure to run at all — malformed configuration, an unknown property, a
missing baseline file. Distinct from a Finding, which is a true statement about
a checkout that ran successfully.
_Avoid_: config error, crash, failure

**Baseline**:
A recorded count of Findings per Document and Rule, used to adopt Docsentry on a
repository that has already drifted without weakening any Contract.
_Avoid_: allowlist, ignore file, suppression list, snapshot

**Proposal**:
A Contract drafted from a checkout for a maintainer to review, carrying the
Findings it would produce if adopted. A Proposal is never applied automatically.
_Avoid_: suggestion, recommendation, auto-config
