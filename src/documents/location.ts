import type { SourceLocation } from "../core/finding.js";

/** Convert a zero-based character offset in a document to a source location. */
export function locationAt(filePath: string, contents: string, offset: number): SourceLocation {
  const prior = contents.slice(0, offset);
  const finalNewline = prior.lastIndexOf("\n");
  return { path: filePath, line: prior.split("\n").length, column: offset - finalNewline };
}
