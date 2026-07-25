# No parser seam until a second format exists

The document parser keeps a single Markdown implementation and does not expose a
public parser-adapter Interface. The Repository reader earns its seam because
production needs a Node adapter while tests need an in-memory one; the parser has
no such second caller, and a seam designed against one implementation would
encode Markdown's shape as if it were universal.

**Falsified if:** a second parser implementation appears under `src/documents/`,
or a parser adapter type becomes part of the published surface, without an ADR
superseding this one.
