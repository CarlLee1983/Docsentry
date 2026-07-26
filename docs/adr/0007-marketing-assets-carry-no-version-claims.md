# Marketing assets carry no version claims

`docs/promo.html` states its Action reference as `CarlLee1983/Docsentry@<version>`
rather than a released version, and its footer names no version at all. The
angle brackets are the placeholder convention this repository already uses for a
name that describes a shape rather than a thing, and they are deliberate: a
reader who "fixes" them to a concrete version reintroduces the drift this
removes.

The page cannot be verified. Docsentry reads Markdown, and HTML is an explicit
non-goal in `SPEC.md`, so nothing would notice the version falling behind — as
nothing did for five releases. A claim that cannot be checked and will not be
maintained is better removed than restated: the released version belongs in
`README.md`, where a version-reference contract holds it to `package.json`.

The cost is that the snippet cannot be copied and run as-is. That is acceptable
for a page whose job is to interest a reader rather than to configure their
repository; the operations guide, which does have that job, carries a real
version and a contract that keeps it current.

**Falsified if:** `docs/promo.html` names a concrete release version anywhere,
or gains a contract in `.docsentry.json`.
