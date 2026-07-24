import { matchesPatterns, type DirectoryTreeConfig, type DocsentryConfig } from "../config.js";
import type { Finding } from "../finding.js";
import { repositoryPaths } from "./path.js";
import type { CodeBlock, DocumentFact } from "../../documents/markdown.js";
import { parseDirectoryTree, type TreeEntry } from "../../documents/tree.js";

export function validateDirectoryTrees(
  documents: readonly DocumentFact[],
  config: DocsentryConfig,
  files: readonly string[],
): Finding[] {
  if (!config.directoryTrees?.length) return [];
  const present = repositoryPaths(files);
  const findings: Finding[] = [];

  for (const tree of config.directoryTrees) {
    const selected = documents.filter((document) => matchesPatterns(document.path, tree.documents));
    for (const document of selected) {
      for (const block of document.codeBlocks) {
        if (!block.fenceLabels.includes(tree.fenceLabel)) continue;
        findings.push(...checkBlock(document, block, tree, files, present));
      }
    }
  }
  return findings;
}

function checkBlock(
  document: DocumentFact,
  block: CodeBlock,
  tree: DirectoryTreeConfig,
  files: readonly string[],
  present: ReadonlySet<string>,
): Finding[] {
  const { entries, unparsed } = parseDirectoryTree(block.value, block.location.line + 1);
  const findings: Finding[] = unparsed.map((line) => ({
    rule: "DOC_TREE_UNPARSED",
    severity: "warning",
    message: `Tree entry "${line.text}" was skipped because its ${line.reason}.`,
    document: { path: document.path, line: line.line, column: line.column },
    suggestion: "Use consistent indentation, or box-drawing branches, for every level.",
  }));

  const resolved = entries.map((entry) => ({ ...entry, path: repositoryPath(entry, tree.root) }));
  for (const entry of resolved) {
    if (present.has(entry.path)) continue;
    findings.push({
      rule: "DOC_TREE_PATH_MISSING",
      severity: "error",
      message: `Documented ${entry.directory ? "directory" : "path"} "${entry.path}" does not exist in the repository.`,
      document: { path: document.path, line: entry.line, column: entry.column },
      suggestion: "Update the documented tree or add the missing path.",
    });
  }

  if (tree.mode !== "exact") return findings;

  const documentedFiles = new Set(resolved.filter((entry) => !entry.directory).map((entry) => entry.path));
  const collapsedDirectories = resolved
    .filter((entry) => entry.directory)
    .map((entry) => entry.path)
    .filter((directory) => !resolved.some((entry) => entry.path.startsWith(`${directory}/`)));

  for (const file of files) {
    if (!isUnderRoot(file, tree.root)) continue;
    if (tree.ignore && matchesPatterns(file, tree.ignore)) continue;
    if (documentedFiles.has(file)) continue;
    if (collapsedDirectories.some((directory) => file.startsWith(`${directory}/`))) continue;
    findings.push({
      rule: "DOC_TREE_PATH_UNDOCUMENTED",
      severity: "error",
      message: `Repository file "${file}" is missing from the documented tree.`,
      document: block.location,
      evidence: { path: file },
      suggestion: "Add the file to the tree, list its directory without children, or ignore it.",
    });
  }
  return findings;
}

/** Combine a parsed entry with the configured root, which the tree may already state. */
function repositoryPath(entry: TreeEntry, root: string | undefined): string {
  const joined = entry.segments.join("/");
  if (!root) return joined;
  return joined === root || joined.startsWith(`${root}/`) ? joined : `${root}/${joined}`;
}

export function isUnderRoot(filePath: string, root: string | undefined): boolean {
  return !root || filePath.startsWith(`${root}/`);
}
