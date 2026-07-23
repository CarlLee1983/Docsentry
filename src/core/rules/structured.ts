import { Ajv, type ValidateFunction } from "ajv";

import type { DocsentryConfig } from "../config.js";
import { matchesPatterns } from "../config.js";
import type { Finding } from "../finding.js";
import type { DocumentFact } from "../../documents/markdown.js";
import { parseStructuredBlock } from "../../evidence/structured.js";
import type { RepositoryReader } from "../../repository/reader.js";

export async function validateStructuredExamples(
  documents: readonly DocumentFact[],
  config: DocsentryConfig,
  reader: RepositoryReader,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const structuredBlocks = documents.flatMap((document) =>
    document.codeBlocks.filter(isStructuredBlock).map((block) => ({ document, block })),
  );

  for (const { block } of structuredBlocks) {
    const parsed = parseStructuredBlock(block);
    if (!parsed.ok) {
      findings.push({
        rule: "DOC_EXAMPLE_PARSE",
        severity: "error",
        message: `Malformed ${block.language?.toUpperCase()} example: ${parsed.message}`,
        document: block.location,
        suggestion: "Make the complete fenced example valid before checking it against a schema.",
      });
    }
  }

  const schemas = new Map<string, SchemaResult>();
  for (const schemaExample of config.schemaExamples ?? []) {
    const selectedBlocks = structuredBlocks.filter(
      ({ document, block }) =>
        matchesPatterns(document.path, schemaExample.documents) && sameLanguage(block.language, schemaExample.language),
    );
    if (selectedBlocks.length === 0) continue;
    const schema = await loadSchema(reader, schemaExample.schema, schemas);
    for (const { block } of selectedBlocks) {
      const parsed = parseStructuredBlock(block);
      if (!parsed.ok) continue;
      if (!schema.ok) {
        findings.push({
          rule: "DOC_SCHEMA_UNAVAILABLE",
          severity: "error",
          message: schema.message,
          document: block.location,
          evidence: { path: schemaExample.schema },
        });
      } else if (!schema.validate(parsed.value)) {
        findings.push({
          rule: "DOC_SCHEMA_INVALID",
          severity: "error",
          message: `Example does not satisfy ${schemaExample.schema}: ${formatAjvErrors(schema.validate)}.`,
          document: block.location,
          evidence: { path: schemaExample.schema },
          suggestion: "Update the example or the selected JSON Schema.",
        });
      }
    }
  }
  return findings;
}

type SchemaResult =
  | { ok: true; validate: ValidateFunction }
  | { ok: false; message: string };

async function loadSchema(
  reader: RepositoryReader,
  schemaPath: string,
  cache: Map<string, SchemaResult>,
): Promise<SchemaResult> {
  const cached = cache.get(schemaPath);
  if (cached) return cached;
  let result: SchemaResult;
  try {
    const schema = JSON.parse(await reader.readText(schemaPath));
    const ajv = new Ajv({ allErrors: true, strict: false });
    result = { ok: true, validate: ajv.compile(schema) };
  } catch (error: unknown) {
    result = { ok: false, message: `Cannot load JSON Schema ${schemaPath}: ${messageOf(error)}` };
  }
  cache.set(schemaPath, result);
  return result;
}

function isStructuredBlock(block: DocumentFact["codeBlocks"][number]): boolean {
  return block.language === "json" || block.language === "yaml" || block.language === "yml";
}

function sameLanguage(
  language: string | null,
  requested: "json" | "yaml" | "yml",
): boolean {
  if (requested === "json") return language === "json";
  return language === "yaml" || language === "yml";
}

function formatAjvErrors(validate: ValidateFunction): string {
  return validate.errors
    ?.map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`)
    .join("; ") ?? "validation failed";
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
