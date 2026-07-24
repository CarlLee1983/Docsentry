import type { Root } from "mdast";
import remarkParse from "remark-parse";
import { unified } from "unified";

import type { SourceLocation } from "../core/finding.js";

export type Heading = {
  text: string;
  depth: number;
  anchor: string;
  path: readonly string[];
  location: SourceLocation;
};

export type DocumentLink = {
  url: string;
  image: boolean;
  location: SourceLocation;
};

export type CodeBlock = {
  language: string | null;
  fenceLabels: readonly string[];
  value: string;
  location: SourceLocation;
};

export type CodeSpan = {
  value: string;
  location: SourceLocation;
};

export type DocumentFact = {
  path: string;
  contents: string;
  headings: readonly Heading[];
  links: readonly DocumentLink[];
  codeBlocks: readonly CodeBlock[];
  codeSpans: readonly CodeSpan[];
};

type MdastNode = {
  type: string;
  value?: string;
  url?: string;
  lang?: string | null;
  meta?: string | null;
  depth?: number;
  children?: MdastNode[];
  position?: {
    start: { line: number; column: number };
  };
};

export function parseMarkdown(filePath: string, contents: string): DocumentFact {
  const tree = unified().use(remarkParse).parse(contents) as Root;
  const headings: Heading[] = [];
  const links: DocumentLink[] = [];
  const codeBlocks: CodeBlock[] = [];
  const codeSpans: CodeSpan[] = [];
  const priorHeadings: Array<string | undefined> = [];
  const anchorCounts = new Map<string, number>();

  visit(tree as unknown as MdastNode, (node) => {
    const location = toLocation(filePath, node);
    if (!location) return;

    if (node.type === "heading" && typeof node.depth === "number") {
      const text = textContent(node).trim();
      const baseAnchor = githubAnchor(text);
      const count = anchorCounts.get(baseAnchor) ?? 0;
      anchorCounts.set(baseAnchor, count + 1);
      const anchor = count === 0 ? baseAnchor : `${baseAnchor}-${count}`;
      priorHeadings.length = node.depth;
      priorHeadings[node.depth - 1] = text;
      headings.push({
        text,
        depth: node.depth,
        anchor,
        path: priorHeadings.slice(0, node.depth).filter((part): part is string => part !== undefined),
        location,
      });
    }

    if ((node.type === "link" || node.type === "image") && typeof node.url === "string") {
      links.push({ url: node.url, image: node.type === "image", location });
    }

    if (node.type === "code") {
      codeBlocks.push({
        language: node.lang?.toLowerCase() ?? null,
        fenceLabels: fenceLabels(node.meta),
        value: node.value ?? "",
        location,
      });
    }

    if (node.type === "inlineCode") {
      codeSpans.push({ value: node.value ?? "", location });
    }
  });

  return { path: filePath, contents, headings, links, codeBlocks, codeSpans };
}

export function githubAnchor(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s+/g, "-");
}

function visit(node: MdastNode, callback: (node: MdastNode) => void): void {
  callback(node);
  node.children?.forEach((child) => visit(child, callback));
}

function textContent(node: MdastNode): string {
  if (typeof node.value === "string") return node.value;
  return node.children?.map(textContent).join("") ?? "";
}

function toLocation(filePath: string, node: MdastNode): SourceLocation | undefined {
  if (!node.position) return undefined;
  return { path: filePath, line: node.position.start.line, column: node.position.start.column };
}

function fenceLabels(metadata: string | null | undefined): readonly string[] {
  return metadata?.trim().split(/\s+/).filter(Boolean) ?? [];
}
