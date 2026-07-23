import YAML from "yaml";

import type { CodeBlock } from "../documents/markdown.js";

export type StructuredValue =
  | { ok: true; value: unknown }
  | { ok: false; message: string };

export function parseStructuredBlock(block: CodeBlock): StructuredValue {
  try {
    if (block.language === "json") return { ok: true, value: JSON.parse(block.value) };
    const document = YAML.parseDocument(block.value, { uniqueKeys: true });
    if (document.errors.length > 0) {
      return { ok: false, message: document.errors.map((error) => error.message).join("; ") };
    }
    return { ok: true, value: document.toJS({ maxAliasCount: 0 }) };
  } catch (error: unknown) {
    return { ok: false, message: messageOf(error) };
  }
}

export function stableValue(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortValue(nested)]),
    );
  }
  return value;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
