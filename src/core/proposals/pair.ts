import type { ContractProposal } from "../proposal.js";

/** A language tag such as `zh-TW`, `ja`, or `pt-BR`, as used in a filename. */
const LANGUAGE_TAG = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/u;

/**
 * Propose a document pair when a translated document sits beside a canonical
 * original, recognised by a language tag in the filename.
 *
 * Only `commands` are proposed for comparison. Headings and code blocks
 * diverge legitimately while a translation is in progress, whereas a command
 * that differs between editions is a defect in either language.
 */
export function proposeDocumentPairs(files: readonly string[]): ContractProposal[] {
  const markdown = new Set(files.filter((filePath) => filePath.toLowerCase().endsWith(".md")));

  return [...markdown]
    .sort((left, right) => left.localeCompare(right))
    .flatMap((mirror) => {
      const translated = translationOf(mirror);
      if (!translated) return [];
      const canonical = [translated.sibling, translated.atRoot].find(
        (candidate) => candidate !== mirror && markdown.has(candidate),
      );
      if (!canonical) return [];
      return [
        {
          section: "documentPairs" as const,
          label: `commands shared by ${canonical} and ${mirror}`,
          justification: `${mirror} carries the language tag \`${translated.tag}\`, and ${canonical} is its untagged original.`,
          fragment: {
            documentPairs: [{ canonical, mirror, requireSame: ["commands" as const] }],
          },
        },
      ];
    });
}

function translationOf(filePath: string): { tag: string; sibling: string; atRoot: string } | undefined {
  const separator = filePath.lastIndexOf("/");
  const directory = separator === -1 ? "" : filePath.slice(0, separator + 1);
  const name = filePath.slice(separator + 1, filePath.length - ".md".length);
  const tagStart = name.lastIndexOf(".");
  if (tagStart <= 0) return undefined;

  const tag = name.slice(tagStart + 1);
  if (!LANGUAGE_TAG.test(tag)) return undefined;

  const base = `${name.slice(0, tagStart)}.md`;
  return { tag, sibling: `${directory}${base}`, atRoot: base };
}
