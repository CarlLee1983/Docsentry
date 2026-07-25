# Verification stays local and inert

Default verification performs no network I/O and executes no commands: every
answer comes from the checkout on disk. This is what lets Docsentry run as an
untrusted-input check in CI without a token, without egress, and without the
risk that verifying a document runs code the document describes. The opt-in
`--changed <base>` flag is the single deliberate exception, and it runs Git in
the CLI layer before the engine is invoked, so the engine itself never learns
that Git exists.

**Falsified if:** anything under `src/` other than `src/cli/changed-files.ts`
imports `node:child_process`, a network client, or `fetch`.
