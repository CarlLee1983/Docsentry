import { parseMarkdown } from "../documents/markdown.js";
import { NodeRepositoryReader } from "../repository/node-reader.js";
import { normalizeRepositoryPath } from "../repository/path.js";

export async function inspectDocument(root: string, filePath: string): Promise<string> {
  const reader = new NodeRepositoryReader(root);
  const normalized = normalizeRepositoryPath(filePath);
  const document = parseMarkdown(normalized, await reader.readText(normalized));
  return `${JSON.stringify(
    {
      path: document.path,
      headings: document.headings,
      links: document.links,
      codeBlocks: document.codeBlocks,
    },
    null,
    2,
  )}\n`;
}
