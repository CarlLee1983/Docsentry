import { minimatch } from "minimatch";

import { InvocationError } from "./errors.js";
import type { RepositoryReader } from "../repository/reader.js";

export type PackageAssertion = {
  document: string;
  label: string;
  value: string;
  evidence: string;
};

export type SchemaExampleConfig = {
  documents: readonly string[];
  language: "json" | "yaml" | "yml";
  schema: string;
  fenceLabel?: string;
};

export type ActionExampleConfig = {
  documents: readonly string[];
  action: string;
  uses?: string;
};

export type DocumentPairConfig = {
  canonical: string;
  mirror: string;
  requireSame: readonly ("headings" | "commands" | "codeBlocks")[];
};

export type DocsentryConfig = {
  documents?: readonly string[];
  package?: { manifest?: string; assertions?: readonly PackageAssertion[] };
  schemaExamples?: readonly SchemaExampleConfig[];
  actionExamples?: readonly ActionExampleConfig[];
  documentPairs?: readonly DocumentPairConfig[];
};

export async function loadConfig(
  reader: RepositoryReader,
  configPath?: string,
): Promise<DocsentryConfig> {
  const path = configPath ?? ".docsentry.json";
  const exists = await reader.exists(path);
  if (!exists) {
    if (configPath) throw new InvocationError(`Configuration file does not exist: ${configPath}`);
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await reader.readText(path));
  } catch (error: unknown) {
    throw new InvocationError(`Cannot parse configuration ${path}: ${messageOf(error)}`);
  }
  return validateConfig(parsed, path);
}

export function matchesPatterns(filePath: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => minimatch(filePath, pattern, { dot: true }));
}

function validateConfig(input: unknown, source: string): DocsentryConfig {
  const value = object(input, source);
  allowOnly(value, ["$schema", "documents", "package", "schemaExamples", "actionExamples", "documentPairs"], source);
  optionalString(value.$schema, "$schema", source);
  const documents = optionalStrings(value.documents, "documents", source);
  const packageConfig = value.package === undefined ? undefined : validatePackage(value.package, source);
  const schemaExamples = optionalArray(value.schemaExamples, "schemaExamples", source)?.map((entry, index) =>
    validateSchemaExample(entry, `${source}: schemaExamples[${index}]`),
  );
  const actionExamples = optionalArray(value.actionExamples, "actionExamples", source)?.map((entry, index) =>
    validateActionExample(entry, `${source}: actionExamples[${index}]`),
  );
  const documentPairs = optionalArray(value.documentPairs, "documentPairs", source)?.map((entry, index) =>
    validateDocumentPair(entry, `${source}: documentPairs[${index}]`),
  );
  return { documents, package: packageConfig, schemaExamples, actionExamples, documentPairs };
}

function validatePackage(input: unknown, source: string): DocsentryConfig["package"] {
  const value = object(input, source);
  allowOnly(value, ["manifest", "assertions"], source);
  const manifest = optionalString(value.manifest, "package.manifest", source);
  const assertions = optionalArray(value.assertions, "package.assertions", source)?.map((entry, index) => {
    const assertion = object(entry, `${source}: package.assertions[${index}]`);
    allowOnly(assertion, ["document", "label", "value", "evidence"], `${source}: package.assertions[${index}]`);
    return {
      document: requiredString(assertion.document, "document", source),
      label: requiredString(assertion.label, "label", source),
      value: requiredString(assertion.value, "value", source),
      evidence: requiredString(assertion.evidence, "evidence", source),
    };
  });
  return { manifest, assertions };
}

function validateSchemaExample(input: unknown, source: string): SchemaExampleConfig {
  const value = object(input, source);
  allowOnly(value, ["documents", "language", "schema", "fenceLabel"], source);
  const language = requiredString(value.language, "language", source);
  if (language !== "json" && language !== "yaml" && language !== "yml") {
    throw new InvocationError(`${source}: language must be json, yaml, or yml`);
  }
  const fenceLabel = optionalString(value.fenceLabel, "fenceLabel", source);
  if (fenceLabel && /\s/.test(fenceLabel)) {
    throw new InvocationError(`${source}: fenceLabel must be one whitespace-free label`);
  }
  return {
    documents: requiredStrings(value.documents, "documents", source),
    language,
    schema: requiredString(value.schema, "schema", source),
    fenceLabel,
  };
}

function validateActionExample(input: unknown, source: string): ActionExampleConfig {
  const value = object(input, source);
  allowOnly(value, ["documents", "action", "uses"], source);
  return {
    documents: requiredStrings(value.documents, "documents", source),
    action: requiredString(value.action, "action", source),
    uses: optionalString(value.uses, "uses", source),
  };
}

function validateDocumentPair(input: unknown, source: string): DocumentPairConfig {
  const value = object(input, source);
  allowOnly(value, ["canonical", "mirror", "requireSame"], source);
  const requireSame = requiredStrings(value.requireSame, "requireSame", source);
  if (requireSame.some((part) => part !== "headings" && part !== "commands" && part !== "codeBlocks")) {
    throw new InvocationError(`${source}: requireSame supports headings, commands, and codeBlocks`);
  }
  if (new Set(requireSame).size !== requireSame.length) {
    throw new InvocationError(`${source}: requireSame must not contain duplicate values`);
  }
  return {
    canonical: requiredString(value.canonical, "canonical", source),
    mirror: requiredString(value.mirror, "mirror", source),
    requireSame: requireSame as DocumentPairConfig["requireSame"],
  };
}

function object(input: unknown, source: string): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new InvocationError(`${source}: expected an object`);
  }
  return input as Record<string, unknown>;
}

function allowOnly(value: Record<string, unknown>, allowed: readonly string[], source: string): void {
  const unexpected = Object.keys(value).find((key) => !allowed.includes(key));
  if (unexpected) throw new InvocationError(`${source}: unknown property ${unexpected}`);
}

function optionalArray(input: unknown, field: string, source: string): unknown[] | undefined {
  if (input === undefined) return undefined;
  if (!Array.isArray(input)) throw new InvocationError(`${source}: ${field} must be an array`);
  return input;
}

function optionalString(input: unknown, field: string, source: string): string | undefined {
  if (input === undefined) return undefined;
  return requiredString(input, field, source);
}

function optionalStrings(input: unknown, field: string, source: string): string[] | undefined {
  if (input === undefined) return undefined;
  return requiredStrings(input, field, source);
}

function requiredStrings(input: unknown, field: string, source: string): string[] {
  if (
    !Array.isArray(input) ||
    input.length === 0 ||
    input.some((item) => typeof item !== "string" || item.length === 0)
  ) {
    throw new InvocationError(`${source}: ${field} must be an array of strings`);
  }
  return input;
}

function requiredString(input: unknown, field: string, source: string): string {
  if (typeof input !== "string" || input.length === 0) {
    throw new InvocationError(`${source}: ${field} must be a non-empty string`);
  }
  return input;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
