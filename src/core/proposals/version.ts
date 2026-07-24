import type { ContractProposal } from "../proposal.js";
import type { DocumentFact } from "../../documents/markdown.js";

/**
 * Propose a version reference contract for every version literal that already
 * equals the manifest version.
 *
 * The literal is rewritten into a pattern by keeping the text immediately
 * before it, which is what distinguishes an install command or an Action
 * reference from an unrelated version-like number. A prefix must contain `/`
 * or `@` to qualify: those are the characters that appear in a package
 * specifier, an Action reference, and a registry URL, and requiring one keeps
 * a changelog heading such as `## v1.2.0` from becoming a contract that would
 * match every version in the document.
 */
export function proposeVersionReferences(
  documents: readonly DocumentFact[],
  manifestPath: string,
  version: string,
): ContractProposal[] {
  if (!version) return [];

  const byPattern = new Map<string, string[]>();
  for (const document of documents) {
    for (const prefix of prefixesOf(document.contents, version)) {
      const pattern = `${prefix}{version}`;
      const paths = byPattern.get(pattern) ?? [];
      if (!paths.includes(document.path)) paths.push(document.path);
      byPattern.set(pattern, paths);
    }
  }

  return [...byPattern.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([pattern, paths]) => ({
      section: "versionReferences" as const,
      label: `documented version in \`${pattern}\``,
      justification: `${paths[0]} states \`${pattern.replace("{version}", version)}\`, which already matches the version in ${manifestPath}.`,
      fragment: {
        versionReferences: [
          {
            documents: paths,
            pattern,
            ...(manifestPath === "package.json" ? {} : { manifest: manifestPath }),
            label: "documented version reference",
            required: true,
          },
        ],
      },
    }));
}

function prefixesOf(contents: string, version: string): string[] {
  const found: string[] = [];
  for (let index = contents.indexOf(version); index !== -1; index = contents.indexOf(version, index + 1)) {
    if (!isWholeVersion(contents, index, version)) continue;
    const prefix = prefixBefore(contents, index);
    if (prefix && (prefix.includes("/") || prefix.includes("@")) && !found.includes(prefix)) {
      found.push(prefix);
    }
  }
  return found;
}

/** A version literal must not be part of a longer number, such as `11.2.0`. */
function isWholeVersion(contents: string, index: number, version: string): boolean {
  const before = contents[index - 1] ?? "";
  const after = contents[index + version.length] ?? "";
  return !/[\d.]/u.test(before) && !/[\d.]/u.test(after);
}

/**
 * The literal text a pattern keeps: everything back to the nearest boundary.
 * A backtick or quotation mark ends the prefix because it delimits an inline
 * code span rather than belonging to the reference.
 */
function prefixBefore(contents: string, index: number): string {
  let start = index;
  while (start > 0 && !/[\s`'"(<[]/u.test(contents[start - 1] ?? "")) start -= 1;
  return contents.slice(start, index);
}
