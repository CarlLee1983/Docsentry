import { matchesPatterns, type DocsentryConfig, type EnumerationConfig } from "../config.js";
import type { Finding } from "../finding.js";
import type { CodeSpan, DocumentFact } from "../../documents/markdown.js";
import { collectLiterals, collectPointerValues, type LiteralEvidence } from "../../evidence/literals.js";
import type { RepositoryReader } from "../../repository/reader.js";

export async function validateEnumerations(
  documents: readonly DocumentFact[],
  config: DocsentryConfig,
  reader: RepositoryReader,
  files: readonly string[],
): Promise<Finding[]> {
  if (!config.enumerations?.length) return [];
  const findings: Finding[] = [];

  for (const enumeration of config.enumerations) {
    const selected = documents.filter((document) => matchesPatterns(document.path, enumeration.documents));
    if (selected.length === 0) continue;
    const values = enumeration.values;
    const evidence =
      "manifest" in values
        ? await collectPointerValues(reader, values.manifest, values.pointer)
        : await collectLiterals(reader, files, values.sources, values.pattern);

    for (const document of selected) {
      findings.push(...checkDocument(document, enumeration, evidence));
    }
  }
  return findings;
}

function checkDocument(
  document: DocumentFact,
  enumeration: EnumerationConfig,
  evidence: LiteralEvidence,
): Finding[] {
  const start = { path: document.path, line: 1, column: 1 };
  if (evidence.sourceCount === 0) {
    return [
      {
        rule: "DOC_ENUM_SOURCE_UNAVAILABLE",
        severity: "error",
        message: `The ${enumeration.label} evidence ${describeSource(enumeration)} produced no values.`,
        document: start,
        suggestion: "Point the enumeration at evidence that exists and holds a list of values.",
      },
    ];
  }

  const section = enumeration.documented.section;
  const spans = section === undefined ? document.codeSpans : sectionSpans(document, section);
  if (spans === undefined) {
    return [
      {
        rule: "DOC_ENUM_SECTION_MISSING",
        severity: "error",
        message: `${document.path} has no "${section}" heading for its ${enumeration.label} list.`,
        document: start,
        suggestion: "Add the heading or update the configured section.",
      },
    ];
  }

  const expression = new RegExp(`^(?:${enumeration.documented.pattern})$`);
  const documented = new Map<string, CodeSpan>();
  for (const span of spans) {
    const value = span.value.trim();
    if (expression.test(value) && !documented.has(value)) documented.set(value, span);
  }

  const findings: Finding[] = [];
  for (const [value, source] of sorted(evidence.values)) {
    if (documented.has(value)) continue;
    findings.push({
      rule: "DOC_ENUM_UNDOCUMENTED",
      severity: "error",
      message: `${enumeration.label} "${value}" is defined but ${document.path} does not list it.`,
      document: start,
      evidence: { path: source, pointer: evidence.pointer },
      suggestion: `Add ${value} to the documented ${enumeration.label} list.`,
    });
  }
  for (const [value, span] of documented) {
    if (evidence.values.has(value)) continue;
    findings.push({
      rule: "DOC_ENUM_UNKNOWN",
      severity: "error",
      message: `Documented ${enumeration.label} "${value}" is not defined in ${describeSource(enumeration)}.`,
      document: span.location,
      suggestion: "Remove the entry or restore the value it names.",
    });
  }
  return findings;
}

function describeSource(enumeration: EnumerationConfig): string {
  const values = enumeration.values;
  return "manifest" in values
    ? values.pointer.map((pointer) => `${values.manifest}${pointer}`).join(", ")
    : values.sources.join(", ");
}

/** Code spans between a heading and the next heading of the same or higher level. */
function sectionSpans(document: DocumentFact, section: string): readonly CodeSpan[] | undefined {
  const index = document.headings.findIndex((heading) => heading.text === section);
  if (index === -1) return undefined;
  const heading = document.headings[index];
  if (!heading) return undefined;
  const next = document.headings.slice(index + 1).find((candidate) => candidate.depth <= heading.depth);
  const end = next?.location.line ?? Number.POSITIVE_INFINITY;
  return document.codeSpans.filter((span) => span.location.line > heading.location.line && span.location.line < end);
}

function sorted(values: ReadonlyMap<string, string>): [string, string][] {
  return [...values].sort(([left], [right]) => left.localeCompare(right));
}
