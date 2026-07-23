import type { DocsentryConfig } from "../config.js";
import type { Finding, SourceLocation } from "../finding.js";
import { extractShellCommands } from "../../documents/commands.js";
import type { CodeBlock, DocumentFact } from "../../documents/markdown.js";
import { parseStructuredBlock, stableValue } from "../../evidence/structured.js";

type DocumentLoader = (filePath: string) => Promise<DocumentFact>;

export async function validateDocumentPairs(
  config: DocsentryConfig,
  loadDocument: DocumentLoader,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const pair of config.documentPairs ?? []) {
    let canonical: DocumentFact;
    let mirror: DocumentFact;
    try {
      [canonical, mirror] = await Promise.all([loadDocument(pair.canonical), loadDocument(pair.mirror)]);
    } catch (error: unknown) {
      findings.push({
        rule: "DOC_PAIR_DOCUMENT_MISSING",
        severity: "error",
        message: `Cannot load configured document pair: ${messageOf(error)}.`,
        document: { path: pair.mirror, line: 1, column: 1 },
      });
      continue;
    }

    if (pair.requireSame.includes("headings")) {
      const canonicalValues = canonical.headings.map((heading) => heading.path.join(" > "));
      const mirrorValues = mirror.headings.map((heading) => heading.path.join(" > "));
      if (!sameSequence(canonicalValues, mirrorValues)) {
        findings.push(mismatch("DOC_PAIR_HEADINGS_MISMATCH", "Heading paths", canonicalValues, mirrorValues, mirror.headings.map((heading) => heading.location), mirror));
      }
    }

    if (pair.requireSame.includes("commands")) {
      const canonicalCommands = extractShellCommands(canonical);
      const mirrorCommands = extractShellCommands(mirror);
      const canonicalValues = canonicalCommands.map((command) => normalizeWhitespace(command.text));
      const mirrorValues = mirrorCommands.map((command) => normalizeWhitespace(command.text));
      if (!sameSequence(canonicalValues, mirrorValues)) {
        findings.push(mismatch("DOC_PAIR_COMMAND_MISMATCH", "Shell commands", canonicalValues, mirrorValues, mirrorCommands.map((command) => command.location), mirror));
      }
    }

    if (pair.requireSame.includes("codeBlocks")) {
      const canonicalValues = canonical.codeBlocks.map(normalizeCodeBlock);
      const mirrorValues = mirror.codeBlocks.map(normalizeCodeBlock);
      if (!sameSequence(canonicalValues, mirrorValues)) {
        findings.push(mismatch("DOC_PAIR_CODE_BLOCK_MISMATCH", "Fenced code blocks", canonicalValues, mirrorValues, mirror.codeBlocks.map((block) => block.location), mirror));
      }
    }
  }
  return findings;
}

function mismatch(
  rule: string,
  label: string,
  canonical: readonly string[],
  mirror: readonly string[],
  locations: readonly SourceLocation[],
  mirrorDocument: DocumentFact,
): Finding {
  const index = firstDifference(canonical, mirror);
  return {
    rule,
    severity: "error",
    message: `${label} diverge from the canonical document at item ${index + 1}.`,
    document: locations[index] ?? { path: mirrorDocument.path, line: 1, column: 1 },
    evidence: { path: mirrorDocument.path },
    suggestion: "Align the mirror's required structure with its canonical document.",
  };
}

function normalizeCodeBlock(block: CodeBlock): string {
  if (block.language === "json" || block.language === "yaml" || block.language === "yml") {
    const parsed = parseStructuredBlock(block);
    if (parsed.ok) return `${block.language}:${stableValue(parsed.value)}`;
  }
  return `${block.language ?? ""}:${normalizeWhitespace(block.value)}`;
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function sameSequence(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function firstDifference(left: readonly string[], right: readonly string[]): number {
  const shared = Math.min(left.length, right.length);
  for (let index = 0; index < shared; index += 1) {
    if (left[index] !== right[index]) return index;
  }
  return shared;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
