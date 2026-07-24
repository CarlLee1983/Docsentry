export type TreeEntry = {
  /** Path segments relative to the tree's own root line. */
  segments: readonly string[];
  directory: boolean;
  line: number;
  column: number;
};

export type UnparsedTreeLine = {
  line: number;
  column: number;
  text: string;
  reason: string;
};

export type ParsedTree = {
  entries: readonly TreeEntry[];
  unparsed: readonly UnparsedTreeLine[];
};

const BRANCH = /[├└]──/g;
const TRUNK = /[│|]/g;
const TRAILING_COMMENT = /\s+#.*$/;

/**
 * Parse an ASCII directory tree written with indentation or box-drawing
 * characters. `startLine` is the source line of the block's first content line.
 */
export function parseDirectoryTree(value: string, startLine: number): ParsedTree {
  const entries: TreeEntry[] = [];
  const unparsed: UnparsedTreeLine[] = [];
  const stack: string[] = [];
  let indentUnit: number | undefined;

  value.split("\n").forEach((rawLine, index) => {
    const line = startLine + index;
    const withoutComment = rawLine.replace(TRAILING_COMMENT, "");
    if (!withoutComment.trim()) return;

    const flattened = withoutComment.replace(BRANCH, "   ").replace(TRUNK, " ");
    const name = flattened.trim();
    const indent = flattened.length - flattened.trimStart().length;
    const column = rawLine.length - rawLine.trimStart().length + 1;

    if (indent > 0 && indentUnit === undefined) indentUnit = indent;
    const unit = indentUnit ?? indent;
    if (indent > 0 && unit > 0 && indent % unit !== 0) {
      unparsed.push({ line, column, text: name, reason: `indentation is not a multiple of ${unit}` });
      return;
    }

    const depth = indent === 0 ? 0 : indent / unit;
    if (depth > stack.length) {
      unparsed.push({ line, column, text: name, reason: "entry skips a level of its parent" });
      return;
    }

    const directory = name.endsWith("/");
    const segment = directory ? name.slice(0, -1) : name;
    if (!segment || segment.includes("/")) {
      unparsed.push({ line, column, text: name, reason: "entry is not a single path segment" });
      return;
    }

    stack.length = depth;
    stack.push(segment);
    entries.push({ segments: [...stack], directory, line, column });
  });

  return { entries, unparsed };
}
