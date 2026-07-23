import YAML, { LineCounter, isMap, isNode, isScalar, isSeq, type Node, type Pair, type YAMLMap } from "yaml";

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

export type WorkflowActionExample = {
  location: { line: number; column: number };
  inputs: readonly WorkflowInput[];
};

export type WorkflowInput = {
  key: string;
  location: { line: number; column: number };
};

/** @deprecated Prefer workflowActionExamples when the YAML source is available. */
export function workflowWithKeys(value: unknown): readonly string[] {
  const keys = new Set<string>();
  collectWithKeys(value, keys);
  return [...keys].sort((left, right) => left.localeCompare(right));
}

/**
 * Finds `with:` mappings in a workflow example. When `uses` is provided, only
 * mappings belonging to that Action are selected; `@ref` suffixes are ignored.
 */
export function workflowActionExamples(source: string, uses?: string): readonly WorkflowActionExample[] {
  const lineCounter = new LineCounter();
  const document = YAML.parseDocument(source, { lineCounter, uniqueKeys: true });
  if (document.errors.length > 0) return [];

  const examples: WorkflowActionExample[] = [];
  collectActionExamples(document.contents, uses, lineCounter, examples);
  return examples;
}

function collectActionExamples(
  node: Node | null,
  uses: string | undefined,
  lineCounter: LineCounter,
  examples: WorkflowActionExample[],
): void {
  if (isMap(node)) {
    const usesValue = mapString(node, "uses");
    const withPair = mapPair(node, "with");
    if (withPair && isMap(withPair.value) && matchesAction(usesValue, uses)) {
      const location = positionOf(withPair, lineCounter);
      if (location) {
        examples.push({
          location,
          inputs: withPair.value.items.flatMap((pair) => inputFromPair(pair, lineCounter)),
        });
      }
    }
    node.items.forEach((pair) => collectValue(pair.value, uses, lineCounter, examples));
    return;
  }
  if (isSeq(node)) node.items.forEach((item) => collectValue(item, uses, lineCounter, examples));
}

function collectValue(
  value: unknown,
  uses: string | undefined,
  lineCounter: LineCounter,
  examples: WorkflowActionExample[],
): void {
  if (isNode(value)) collectActionExamples(value, uses, lineCounter, examples);
}

function mapPair(map: YAMLMap, expectedKey: string): Pair | undefined {
  return map.items.find((pair) => isScalar(pair.key) && pair.key.value === expectedKey);
}

function mapString(map: YAMLMap, expectedKey: string): string | undefined {
  const value = mapPair(map, expectedKey)?.value;
  return isScalar(value) && typeof value.value === "string" ? value.value : undefined;
}

function matchesAction(documentedUses: string | undefined, configuredUses: string | undefined): boolean {
  if (!configuredUses) return true;
  return documentedUses !== undefined && actionIdentity(documentedUses) === actionIdentity(configuredUses);
}

function actionIdentity(value: string): string {
  return value.trim().split("@", 1)[0] ?? "";
}

function inputFromPair(pair: Pair, lineCounter: LineCounter): WorkflowInput[] {
  if (!isScalar(pair.key) || typeof pair.key.value !== "string") return [];
  const location = positionOf(pair, lineCounter);
  return location ? [{ key: pair.key.value, location }] : [];
}

function positionOf(pair: Pair, lineCounter: LineCounter): { line: number; column: number } | undefined {
  if (!isScalar(pair.key) || !pair.key.range) return undefined;
  const position = lineCounter.linePos(pair.key.range[0]);
  return position.line > 0 ? { line: position.line, column: position.col } : undefined;
}

function collectWithKeys(value: unknown, keys: Set<string>): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectWithKeys(item, keys));
    return;
  }
  if (!isRecord(value)) return;
  if (isRecord(value.with)) Object.keys(value.with).forEach((key) => keys.add(key));
  Object.values(value).forEach((nested) => collectWithKeys(nested, keys));
}
