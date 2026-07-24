import YAML from "yaml";

import { matchesPatterns } from "../core/config.js";
import { isRecord, jsonPointer } from "./package.js";
import type { RepositoryReader } from "../repository/reader.js";

export type LiteralEvidence = {
  /** Each collected value, mapped to the first source file that states it. */
  values: ReadonlyMap<string, string>;
  sourceCount: number;
  pointer?: string;
};

/**
 * Collect values from one structured manifest through a JSON pointer. An array
 * contributes its string items and a mapping contributes its keys, which covers
 * a JSON Schema enum and an Action input mapping respectively.
 */
export async function collectPointerValues(
  reader: RepositoryReader,
  manifest: string,
  pointers: readonly string[],
): Promise<LiteralEvidence> {
  const single = pointers.length === 1 ? pointers[0] : undefined;
  const unavailable: LiteralEvidence = { values: new Map(), sourceCount: 0, pointer: single };
  if (!(await reader.exists(manifest))) return unavailable;

  let parsed: unknown;
  try {
    const contents = await reader.readText(manifest);
    parsed = manifest.toLowerCase().endsWith(".json")
      ? JSON.parse(contents)
      : YAML.parse(contents, { maxAliasCount: 0 });
  } catch {
    return unavailable;
  }

  const values = new Map<string, string>();
  for (const pointer of pointers) {
    for (const value of valuesAt(parsed, pointer)) {
      if (!values.has(value)) values.set(value, manifest);
    }
  }
  if (values.size === 0) return unavailable;

  return { values, sourceCount: 1, pointer: single };
}

/** An array contributes its string items; a mapping contributes its keys. */
function valuesAt(parsed: unknown, pointer: string): readonly string[] {
  const selected = jsonPointer(parsed, pointer);
  if (Array.isArray(selected)) return selected.filter((item): item is string => typeof item === "string");
  if (isRecord(selected)) return Object.keys(selected);
  return [];
}

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
