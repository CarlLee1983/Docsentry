# Annotations as a reporter, not a Checks integration

GitHub PR annotations are produced by a reporter that writes workflow commands to
stdout, not by an integration that posts to the Checks API. The reporter form
inherits the properties decided in ADR-0002 — no token, no network I/O — so
annotating a pull request needs no repository secret and cannot fail because an
API call did. The cost is that annotations are limited to what workflow commands
express, and are unavailable outside GitHub Actions.

**Falsified if:** the GitHub reporter acquires a token parameter or performs
network I/O.
