import type { ContractProposal } from "../proposal.js";
import { pathCandidate, repositoryPaths } from "../rules/path.js";
import type { DocumentFact } from "../../documents/markdown.js";

/**
 * Propose a path reference contract covering the inline code spans that
 * already name committed files.
 *
 * Candidate spans are recognised with the same function the rule uses, so the
 * proposal cannot select something the contract would then ignore. The
 * `include` patterns are generalised from the paths that resolve today: a
 * top-level directory becomes a recursive pattern and a root file becomes an
 * extension pattern. This is the inferring step — a documented path that is
 * already broken falls outside the generalisation unless a sibling path
 * happens to cover it, so the proposal reports its adoption cost rather than
 * claiming completeness.
 */
export function proposePathReferences(
  documents: readonly DocumentFact[],
  files: readonly string[],
): ContractProposal[] {
  const present = repositoryPaths(files);
  const committed = new Set(files);
  const includes = new Set<string>();
  const paths: string[] = [];
  let examples = 0;

  for (const document of documents) {
    let stated = false;
    for (const span of document.codeSpans) {
      const candidate = pathCandidate(span.value);
      if (!candidate || !present.has(candidate)) continue;
      includes.add(includePattern(candidate, committed.has(candidate)));
      stated = true;
      examples += 1;
    }
    if (stated) paths.push(document.path);
  }

  if (includes.size === 0) return [];
  const include = [...includes].sort((left, right) => left.localeCompare(right));

  return [
    {
      section: "pathReferences",
      label: "documented repository paths",
      justification: `${examples} inline code span(s) across ${paths.length} document(s) already name committed files, covered by ${include.join(", ")}.`,
      caveat: "A pattern also covers paths a document names as a convention rather than a file, such as one a command writes. Use exclude for those.",
      fragment: { pathReferences: [{ documents: paths, include }] },
    },
  ];
}

function includePattern(candidate: string, isFile: boolean): string {
  const separator = candidate.indexOf("/");
  if (separator !== -1) return `${candidate.slice(0, separator)}/**`;
  // A documented top-level directory covers what it contains; a root file is
  // generalised to its extension so a sibling of the same kind is covered too.
  if (!isFile) return `${candidate}/**`;
  const dot = candidate.lastIndexOf(".");
  return dot > 0 ? `*${candidate.slice(dot)}` : candidate;
}
