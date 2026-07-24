import type { ContractProposal } from "../proposal.js";
import type { DocumentFact } from "../../documents/markdown.js";

const USES = /^\s*-?\s*uses:\s*(\S+)/gmu;

/**
 * Propose an Action example contract when a workflow example shows this
 * repository's own Action.
 *
 * The Action is identified by an exact, case-insensitive match between the
 * final segment of a `uses:` reference and the final segment of the package
 * name. A workflow example usually references several Actions, so a proposal
 * that could not name one would have to validate every `with:` mapping in the
 * document — which reports another Action's inputs as unknown. When nothing
 * matches, nothing is proposed.
 */
export function proposeActionExamples(
  documents: readonly DocumentFact[],
  actionPath: string,
  packageName: string | undefined,
): ContractProposal[] {
  const own = ownName(packageName);
  if (!own) return [];

  const byReference = new Map<string, string[]>();
  for (const document of documents) {
    for (const reference of referencesIn(document)) {
      if (finalSegment(reference).toLowerCase() !== own) continue;
      const paths = byReference.get(reference) ?? [];
      if (!paths.includes(document.path)) paths.push(document.path);
      byReference.set(reference, paths);
    }
  }

  return [...byReference.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([reference, paths]) => ({
      section: "actionExamples" as const,
      label: `documented inputs of ${reference}`,
      justification: `${paths[0]} shows a workflow example using \`${reference}\`, and this repository defines ${actionPath}.`,
      fragment: {
        actionExamples: [{ documents: paths, action: actionPath, uses: reference }],
      },
    }));
}

function referencesIn(document: DocumentFact): string[] {
  return document.codeBlocks
    .filter((block) => block.language === "yaml" || block.language === "yml")
    .flatMap((block) => [...block.value.matchAll(USES)].map((match) => withoutRef(match[1])));
}

function withoutRef(reference: string): string {
  const at = reference.indexOf("@");
  return at === -1 ? reference : reference.slice(0, at);
}

function finalSegment(value: string): string {
  return value.slice(value.lastIndexOf("/") + 1);
}

function ownName(packageName: string | undefined): string | undefined {
  if (!packageName) return undefined;
  const name = finalSegment(packageName).toLowerCase();
  return name.length > 0 ? name : undefined;
}
