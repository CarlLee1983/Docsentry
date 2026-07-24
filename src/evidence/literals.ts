import { matchesPatterns } from "../core/config.js";
import type { RepositoryReader } from "../repository/reader.js";

export type LiteralEvidence = {
  /** Each collected value, mapped to the first source file that states it. */
  values: ReadonlyMap<string, string>;
  sourceCount: number;
};

/**
 * Collect literal values from selected repository files by pattern.
 *
 * This is deliberately textual: Docsentry does not parse the source language,
 * so a value inside a comment or a disabled branch still counts. The contract
 * verifies that two lists agree, not that a value is reachable.
 */
export async function collectLiterals(
  reader: RepositoryReader,
  files: readonly string[],
  sources: readonly string[],
  pattern: string,
): Promise<LiteralEvidence> {
  const selected = files.filter((filePath) => matchesPatterns(filePath, sources));
  const values = new Map<string, string>();

  for (const filePath of selected) {
    const expression = new RegExp(pattern, "g");
    const contents = await reader.readText(filePath);
    for (const match of contents.matchAll(expression)) {
      const value = match[1] ?? match[0];
      if (value && !values.has(value)) values.set(value, filePath);
    }
  }
  return { values, sourceCount: selected.length };
}
