import type { ContractProposal } from "../proposal.js";
import type { DocumentFact } from "../../documents/markdown.js";

type Candidate = { evidence: string; value: string; label: string };

/**
 * Propose a package assertion for every manifest value a document already
 * restates in an inline code span.
 *
 * The evidence is an exact string match: the document states the value the
 * manifest holds, so the assertion records a claim the repository is already
 * making rather than one inferred from prose.
 */
export function proposePackageAssertions(
  documents: readonly DocumentFact[],
  manifestPath: string,
  manifest: unknown,
): ContractProposal[] {
  return candidates(manifest).flatMap((candidate) => {
    const document = documentStating(documents, candidate.value);
    if (!document) return [];
    return [
      {
        section: "package" as const,
        label: `${candidate.label} in ${document}`,
        justification: `${document} states \`${candidate.value}\`, which is the value at ${candidate.evidence} in ${manifestPath}.`,
        fragment: {
          package: {
            manifest: manifestPath,
            assertions: [
              { document, label: candidate.label, value: candidate.value, evidence: candidate.evidence },
            ],
          },
        },
      },
    ];
  });
}

function candidates(manifest: unknown): Candidate[] {
  if (typeof manifest !== "object" || manifest === null) return [];
  const record = manifest as Record<string, unknown>;
  const found: Candidate[] = [];

  if (typeof record.name === "string") {
    found.push({ evidence: "/name", value: record.name, label: "published package name" });
  }

  const engines = record.engines;
  if (typeof engines === "object" && engines !== null) {
    const node = (engines as Record<string, unknown>).node;
    if (typeof node === "string") {
      found.push({ evidence: "/engines/node", value: node, label: "minimum Node version" });
    }
  }

  // `bin` is deliberately absent. A pointer resolves to a value, never to a
  // key, so `/bin/<name>` reaches the path the command runs rather than the
  // command's own name — and that path is an implementation detail a document
  // states by coincidence, not a promise it makes to a reader. Asserting the
  // command name is what would be worth proposing, and no pointer expresses
  // it, so this candidate is left to be written by hand.

  return found;
}

/**
 * The document that will carry the assertion. A README is preferred because it
 * is the document a reader meets first, and a changelog is preferred last
 * because the value it states may belong to a past release rather than to the
 * current one. Otherwise the earliest path wins, so the proposal is stable
 * across runs.
 */
function documentStating(documents: readonly DocumentFact[], value: string): string | undefined {
  const stating = documents
    // The rule locates an asserted value anywhere in the document's text, so
    // the proposal must recognise it the same way. A narrower test here would
    // pass over a document the contract would happily check.
    .filter((document) => document.contents.includes(value))
    .map((document) => document.path)
    .sort((left, right) => left.localeCompare(right));
  return stating.find(isNamed("readme.md")) ?? stating.find((path) => !isNamed("changelog.md")(path)) ?? stating[0];
}

function isNamed(fileName: string): (filePath: string) => boolean {
  return (filePath) => filePath.slice(filePath.lastIndexOf("/") + 1).toLowerCase() === fileName;
}
