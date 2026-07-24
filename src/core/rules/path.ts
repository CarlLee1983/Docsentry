import { matchesPatterns, type DocsentryConfig, type PathReferenceConfig } from "../config.js";
import type { Finding } from "../finding.js";
import type { DocumentFact } from "../../documents/markdown.js";
import { normalizeRepositoryPath } from "../../repository/path.js";

const GLOB_CHARACTERS = /[*?[\]{}!()]/;
/** A leading dot with no further dot or separator names a file extension, such as `.md`. */
const BARE_EXTENSION = /^\.[^./]*$/;

/**
 * Interpret one inline code span as a repository-relative path candidate.
 * Returns undefined for prose, commands, glob patterns, bare file extensions,
 * and paths that leave the repository, so those stay outside the contract.
 */
export function pathCandidate(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed) || GLOB_CHARACTERS.test(trimmed)) return undefined;
  if (BARE_EXTENSION.test(trimmed)) return undefined;
  const withoutTrailingSlash = trimmed.replace(/\/+$/, "");
  if (!withoutTrailingSlash) return undefined;
  try {
    return normalizeRepositoryPath(withoutTrailingSlash);
  } catch {
    return undefined;
  }
}

export function validatePathReferences(
  documents: readonly DocumentFact[],
  config: DocsentryConfig,
  files: readonly string[],
): Finding[] {
  if (!config.pathReferences?.length) return [];
  const present = repositoryPaths(files);
  const findings: Finding[] = [];

  for (const reference of config.pathReferences) {
    const selected = documents.filter((document) => matchesPatterns(document.path, reference.documents));
    for (const document of selected) {
      for (const span of document.codeSpans) {
        const candidate = selectedPath(span.value, reference);
        if (!candidate || present.has(candidate)) continue;
        findings.push({
          rule: "DOC_PATH_MISSING",
          severity: "error",
          message: `Path "${candidate}" does not exist in the repository.`,
          document: span.location,
          suggestion: "Update the documented path or add the missing file.",
        });
      }
    }
  }
  return findings;
}

export function selectedPath(value: string, reference: PathReferenceConfig): string | undefined {
  const candidate = pathCandidate(value);
  if (!candidate || !matchesPatterns(candidate, reference.include)) return undefined;
  return candidate;
}

/** Every file path plus each directory prefix the repository actually contains. */
function repositoryPaths(files: readonly string[]): ReadonlySet<string> {
  const present = new Set<string>(files);
  for (const file of files) {
    const segments = file.split("/");
    for (let depth = 1; depth < segments.length; depth += 1) {
      present.add(segments.slice(0, depth).join("/"));
    }
  }
  return present;
}
