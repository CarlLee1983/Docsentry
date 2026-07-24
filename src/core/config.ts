import { minimatch } from "minimatch";

import { InvocationError } from "./errors.js";
import type { RepositoryReader } from "../repository/reader.js";

/** The version placeholder accepted inside a version reference pattern. */
export const VERSION_PLACEHOLDER = "{version}";

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

export type VersionReferenceConfig = {
  documents: readonly string[];
  pattern: string;
  manifest?: string;
  evidence?: string;
  label?: string;
  required?: boolean;
};

export type PathReferenceConfig = {
  documents: readonly string[];
  include: readonly string[];
  exclude?: readonly string[];
};

export type DirectoryTreeConfig = {
  documents: readonly string[];
  fenceLabel: string;
  root?: string;
  mode?: "declared-exists" | "exact";
  ignore?: readonly string[];
};

export type DocsentryConfig = {
  documents?: readonly string[];
  package?: { manifest?: string; assertions?: readonly PackageAssertion[] };
  schemaExamples?: readonly SchemaExampleConfig[];
  actionExamples?: readonly ActionExampleConfig[];
  documentPairs?: readonly DocumentPairConfig[];
  versionReferences?: readonly VersionReferenceConfig[];
  pathReferences?: readonly PathReferenceConfig[];
  directoryTrees?: readonly DirectoryTreeConfig[];
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
  allowOnly(
    value,
    [
      "$schema",
      "documents",
      "package",
      "schemaExamples",
      "actionExamples",
      "documentPairs",
      "versionReferences",
      "pathReferences",
      "directoryTrees",
    ],
    source,
  );
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
  const versionReferences = optionalArray(value.versionReferences, "versionReferences", source)?.map((entry, index) =>
    validateVersionReference(entry, `${source}: versionReferences[${index}]`),
  );
  const pathReferences = optionalArray(value.pathReferences, "pathReferences", source)?.map((entry, index) =>
    validatePathReference(entry, `${source}: pathReferences[${index}]`),
  );
  const directoryTrees = optionalArray(value.directoryTrees, "directoryTrees", source)?.map((entry, index) =>
    validateDirectoryTree(entry, `${source}: directoryTrees[${index}]`),
  );
  return {
    documents,
    package: packageConfig,
    schemaExamples,
    actionExamples,
    documentPairs,
    versionReferences,
    pathReferences,
    directoryTrees,
  };
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

function validateVersionReference(input: unknown, source: string): VersionReferenceConfig {
  const value = object(input, source);
  allowOnly(value, ["documents", "pattern", "manifest", "evidence", "label", "required"], source);
  const pattern = requiredString(value.pattern, "pattern", source);
  if (!pattern.includes(VERSION_PLACEHOLDER)) {
    throw new InvocationError(`${source}: pattern must contain ${VERSION_PLACEHOLDER}`);
  }
  const evidence = optionalString(value.evidence, "evidence", source);
  if (evidence !== undefined && !evidence.startsWith("/")) {
    throw new InvocationError(`${source}: evidence must be a JSON pointer beginning with "/"`);
  }
  return {
    documents: requiredStrings(value.documents, "documents", source),
    pattern,
    manifest: optionalString(value.manifest, "manifest", source),
    evidence,
    label: optionalString(value.label, "label", source),
    required: optionalBoolean(value.required, "required", source),
  };
}

function validatePathReference(input: unknown, source: string): PathReferenceConfig {
  const value = object(input, source);
  allowOnly(value, ["documents", "include", "exclude"], source);
  return {
    documents: requiredStrings(value.documents, "documents", source),
    include: requiredStrings(value.include, "include", source),
    exclude: optionalStrings(value.exclude, "exclude", source),
  };
}

function validateDirectoryTree(input: unknown, source: string): DirectoryTreeConfig {
  const value = object(input, source);
  allowOnly(value, ["documents", "fenceLabel", "root", "mode", "ignore"], source);
  const fenceLabel = requiredString(value.fenceLabel, "fenceLabel", source);
  if (/\s/.test(fenceLabel)) throw new InvocationError(`${source}: fenceLabel must be one whitespace-free label`);
  const mode = optionalString(value.mode, "mode", source);
  if (mode !== undefined && mode !== "declared-exists" && mode !== "exact") {
    throw new InvocationError(`${source}: mode supports declared-exists and exact`);
  }
  const root = optionalString(value.root, "root", source);
  if (root !== undefined) normalizeRootOrThrow(root, source);
  return {
    documents: requiredStrings(value.documents, "documents", source),
    fenceLabel,
    root,
    mode,
    ignore: optionalStrings(value.ignore, "ignore", source),
  };
}

function normalizeRootOrThrow(root: string, source: string): void {
  if (root.startsWith("/") || root.endsWith("/") || root.includes("..")) {
    throw new InvocationError(`${source}: root must be a repository-relative directory without a trailing slash`);
  }
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

function optionalBoolean(input: unknown, field: string, source: string): boolean | undefined {
  if (input === undefined) return undefined;
  if (typeof input !== "boolean") throw new InvocationError(`${source}: ${field} must be a boolean`);
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
