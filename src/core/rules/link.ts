import path from "node:path";

import type { Finding } from "../finding.js";
import type { DocumentFact } from "../../documents/markdown.js";
import { resolveRepositoryPath } from "../../repository/path.js";
import type { RepositoryReader } from "../../repository/reader.js";

type DocumentLoader = (filePath: string) => Promise<DocumentFact>;

export async function validateLinks(
  documents: readonly DocumentFact[],
  reader: RepositoryReader,
  loadDocument: DocumentLoader,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const document of documents) {
    for (const link of document.links) {
      const target = parseTarget(link.url);
      if (!target || target.external) continue;

      let targetPath: string;
      try {
        targetPath = target.path ? resolveRepositoryPath(document.path, target.path) : document.path;
      } catch {
        findings.push({
          rule: "DOC_LINK_OUTSIDE_REPOSITORY",
          severity: "error",
          message: `Target "${link.url}" leaves the repository.`,
          document: link.location,
          suggestion: "Use a repository-relative path that stays within the checkout.",
        });
        continue;
      }

      if (!(await reader.exists(targetPath))) {
        findings.push({
          rule: "DOC_LINK_MISSING",
          severity: "error",
          message: `Target "${target.path || link.url}" does not exist.`,
          document: link.location,
          suggestion: "Create the target or update the link.",
        });
        continue;
      }

      if (target.fragment && path.posix.extname(targetPath).toLowerCase() === ".md") {
        const targetDocument = await loadDocument(targetPath);
        if (!targetDocument.headings.some((heading) => heading.anchor === target.fragment)) {
          findings.push({
            rule: "DOC_LINK_ANCHOR_MISSING",
            severity: "error",
            message: `Anchor "#${target.fragment}" does not exist in ${targetPath}.`,
            document: link.location,
            evidence: { path: targetPath },
            suggestion: "Update the fragment to match a heading anchor.",
          });
        }
      }
    }
  }
  return findings;
}

function parseTarget(url: string): { path: string; fragment?: string; external: boolean } | undefined {
  if (!url || /^([A-Za-z][A-Za-z\d+.-]*:|\/\/)/.test(url)) return { path: "", external: true };
  const hashIndex = url.indexOf("#");
  const beforeHash = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const rawFragment = hashIndex === -1 ? undefined : url.slice(hashIndex + 1);
  const rawPath = beforeHash.split("?", 1)[0] ?? "";
  try {
    return {
      path: decodeURIComponent(rawPath),
      fragment: rawFragment ? decodeURIComponent(rawFragment).toLowerCase() : undefined,
      external: false,
    };
  } catch {
    return undefined;
  }
}
