import type { DocsentryConfig } from "../config.js";
import type { Finding } from "../finding.js";
import { extractShellCommands, packageScriptName } from "../../documents/commands.js";
import { locationAt } from "../../documents/location.js";
import type { DocumentFact } from "../../documents/markdown.js";
import { isRecord, jsonPointer, readPackageEvidence } from "../../evidence/package.js";
import type { RepositoryReader } from "../../repository/reader.js";

type DocumentLoader = (filePath: string) => Promise<DocumentFact>;

export async function validatePackageContracts(
  documents: readonly DocumentFact[],
  config: DocsentryConfig,
  reader: RepositoryReader,
  loadDocument: DocumentLoader,
): Promise<Finding[]> {
  if (!config.package) return [];
  const manifest = config.package.manifest ?? "package.json";
  const findings: Finding[] = [];
  let packageValue: Record<string, unknown> | undefined;
  let loadError: string | undefined;
  try {
    packageValue = (await readPackageEvidence(reader, manifest)).value;
  } catch (error: unknown) {
    loadError = messageOf(error);
  }

  for (const document of documents) {
    for (const command of extractShellCommands(document)) {
      const script = packageScriptName(command.text);
      if (!script) continue;
      if (!packageValue) {
        findings.push({
          rule: "DOC_PACKAGE_MISSING",
          severity: "error",
          message: loadError ?? `Package manifest ${manifest} is unavailable.`,
          document: command.location,
          evidence: { path: manifest },
        });
      } else if (!isRecord(packageValue.scripts) || typeof packageValue.scripts[script] !== "string") {
        findings.push({
          rule: "DOC_SCRIPT_UNKNOWN",
          severity: "error",
          message: `Documented script "${script}" does not exist in ${manifest}.`,
          document: command.location,
          evidence: { path: manifest, pointer: `/scripts/${script}` },
          suggestion: "Use an existing script name or add the script to the package manifest.",
        });
      }
    }
  }

  for (const assertion of config.package.assertions ?? []) {
    let document: DocumentFact | undefined;
    try {
      document = await loadDocument(assertion.document);
    } catch {
      findings.push({
        rule: "DOC_PACKAGE_ASSERTION_DOCUMENT_MISSING",
        severity: "error",
        message: `Configured assertion document ${assertion.document} does not exist.`,
        document: { path: assertion.document, line: 1, column: 1 },
      });
      continue;
    }
    const location = literalLocation(document, assertion.value);
    if (!location) {
      findings.push({
        rule: "DOC_PACKAGE_ASSERTION_MISSING",
        severity: "error",
        message: `${assertion.label} is not documented as "${assertion.value}".`,
        document: { path: document.path, line: 1, column: 1 },
        evidence: { path: manifest, pointer: assertion.evidence },
      });
    }
    if (!packageValue || jsonPointer(packageValue, assertion.evidence) !== assertion.value) {
      findings.push({
        rule: "DOC_PACKAGE_ASSERTION_MISMATCH",
        severity: "error",
        message: `${assertion.label} does not match ${manifest}${assertion.evidence}.`,
        document: location ?? { path: document.path, line: 1, column: 1 },
        evidence: { path: manifest, pointer: assertion.evidence },
        suggestion: "Update the document assertion or its package evidence.",
      });
    }
  }
  return findings;
}

function literalLocation(document: DocumentFact, literal: string): Finding["document"] | undefined {
  const offset = document.contents.indexOf(literal);
  if (offset < 0) return undefined;
  return locationAt(document.path, document.contents, offset);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
