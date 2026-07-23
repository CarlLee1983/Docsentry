import YAML from "yaml";

import { isRecord } from "./package.js";
import type { RepositoryReader } from "../repository/reader.js";

export async function readActionInputs(
  reader: RepositoryReader,
  actionPath: string,
): Promise<ReadonlySet<string>> {
  const parsed = YAML.parse(await reader.readText(actionPath), { maxAliasCount: 0 });
  if (!isRecord(parsed)) throw new Error(`${actionPath} must contain a YAML object`);
  const inputs = parsed.inputs;
  if (inputs === undefined) return new Set();
  if (!isRecord(inputs)) throw new Error(`${actionPath}: inputs must be an object`);
  return new Set(Object.keys(inputs));
}

export function workflowWithKeys(value: unknown): readonly string[] {
  const keys = new Set<string>();
  walk(value, keys);
  return [...keys].sort((left, right) => left.localeCompare(right));
}

function walk(value: unknown, keys: Set<string>): void {
  if (Array.isArray(value)) {
    value.forEach((item) => walk(item, keys));
    return;
  }
  if (!isRecord(value)) return;
  if (isRecord(value.with)) Object.keys(value.with).forEach((key) => keys.add(key));
  Object.values(value).forEach((nested) => walk(nested, keys));
}
