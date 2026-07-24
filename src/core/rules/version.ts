import {
  matchesPatterns,
  VERSION_PLACEHOLDER,
  type DocsentryConfig,
  type VersionReferenceConfig,
} from "../config.js";
import type { Finding } from "../finding.js";
import { locationAt } from "../../documents/location.js";
import type { DocumentFact } from "../../documents/markdown.js";
import { jsonPointer, readPackageEvidence } from "../../evidence/package.js";
import type { RepositoryReader } from "../../repository/reader.js";

const SEMVER_GROUP = "(\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?)";

type EvidenceResult = { value: string } | { unavailable: string };

export async function validateVersionReferences(
  documents: readonly DocumentFact[],
  config: DocsentryConfig,
  reader: RepositoryReader,
): Promise<Finding[]> {
  if (!config.versionReferences?.length) return [];
  const manifests = new Map<string, Promise<Record<string, unknown> | undefined>>();
  const findings: Finding[] = [];

  for (const reference of config.versionReferences) {
    const manifest = reference.manifest ?? "package.json";
    const pointer = reference.evidence ?? "/version";
    const evidence = await readVersionEvidence(reader, manifests, manifest, pointer);
    const selected = documents.filter((document) => matchesPatterns(document.path, reference.documents));

    for (const document of selected) {
      findings.push(...checkDocument(document, reference, manifest, pointer, evidence));
    }
  }
  return findings;
}

function checkDocument(
  document: DocumentFact,
  reference: VersionReferenceConfig,
  manifest: string,
  pointer: string,
  evidence: EvidenceResult,
): Finding[] {
  const label = reference.label ?? "Documented version reference";
  const literals = reference.pattern.split(VERSION_PLACEHOLDER);
  const expression = new RegExp(literals.map(escapeRegExp).join(SEMVER_GROUP), "g");
  const findings: Finding[] = [];
  let occurrences = 0;

  for (const match of document.contents.matchAll(expression)) {
    occurrences += 1;
    if ("unavailable" in evidence) {
      findings.push({
        rule: "DOC_VERSION_EVIDENCE_UNAVAILABLE",
        severity: "error",
        message: evidence.unavailable,
        document: locationAt(document.path, document.contents, (match.index ?? 0) + literals[0]!.length),
        evidence: { path: manifest, pointer },
        suggestion: "Point the version reference at an existing manifest value.",
      });
      continue;
    }

    let cursor = match.index ?? 0;
    for (let group = 0; group < literals.length - 1; group += 1) {
      cursor += literals[group]!.length;
      const documented = match[group + 1] ?? "";
      if (documented !== evidence.value) {
        findings.push({
          rule: "DOC_VERSION_STALE",
          severity: "error",
          message: `${label} states ${documented} but ${manifest}${pointer} is ${evidence.value}.`,
          document: locationAt(document.path, document.contents, cursor),
          evidence: { path: manifest, pointer },
          suggestion: `Update the documented version to ${evidence.value}.`,
        });
      }
      cursor += documented.length;
    }
  }

  if (occurrences === 0 && reference.required) {
    findings.push({
      rule: "DOC_VERSION_REFERENCE_MISSING",
      severity: "error",
      message: `${label} is required but ${document.path} does not state "${reference.pattern}".`,
      document: { path: document.path, line: 1, column: 1 },
      evidence: { path: manifest, pointer },
      suggestion: "Document the version reference or make it optional.",
    });
  }
  return findings;
}

async function readVersionEvidence(
  reader: RepositoryReader,
  manifests: Map<string, Promise<Record<string, unknown> | undefined>>,
  manifest: string,
  pointer: string,
): Promise<EvidenceResult> {
  let cached = manifests.get(manifest);
  if (!cached) {
    cached = readPackageEvidence(reader, manifest)
      .then((evidence) => evidence.value)
      .catch(() => undefined);
    manifests.set(manifest, cached);
  }
  const value = await cached;
  if (!value) return { unavailable: `Version evidence ${manifest} is unavailable.` };
  const resolved = jsonPointer(value, pointer);
  if (typeof resolved !== "string" || resolved.length === 0) {
    return { unavailable: `Version evidence ${manifest}${pointer} is unavailable.` };
  }
  return { value: resolved };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
