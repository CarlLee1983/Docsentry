import { loadConfig, type DocsentryConfig } from "./config.js";
import { mergeFragments, type ContractProposal } from "./proposal.js";
import { proposeActionExamples } from "./proposals/action.js";
import { proposeDocumentPairs } from "./proposals/pair.js";
import { proposePackageAssertions } from "./proposals/package.js";
import { proposePathReferences } from "./proposals/path.js";
import { proposeSchemaExamples } from "./proposals/structured.js";
import { proposeVersionReferences } from "./proposals/version.js";
import { DocsentryVerificationEngine } from "./verify.js";
import { parseMarkdown } from "../documents/markdown.js";
import type { RepositoryReader } from "../repository/reader.js";

/** What adopting a proposed contract would report against the current checkout. */
export type ProposalCost = { errors: number; warnings: number };

export type CostedProposal = ContractProposal & { cost: ProposalCost };

export type ContractSuggestion = {
  /** A document selection derived from the Markdown the repository contains. */
  documents: readonly string[];
  proposals: readonly CostedProposal[];
  /** The configuration already committed, when the repository has one. */
  existing?: DocsentryConfig;
};

/**
 * Read a checkout and draft the contracts its artifacts support.
 *
 * Nothing here reports a Finding. Each proposal names the artifact that
 * justifies it and the findings adopting it would produce, so the decision
 * stays with the maintainer who commits the configuration.
 */
export async function suggestContracts(
  reader: RepositoryReader,
  options: { configPath?: string } = {},
): Promise<ContractSuggestion> {
  const files = await reader.listFiles();
  const markdown = files.filter(isMarkdown);
  const existing = (await hasConfig(reader, options.configPath))
    ? await loadConfig(reader, options.configPath)
    : undefined;

  const documents = await Promise.all(
    markdown.map(async (filePath) => parseMarkdown(filePath, await reader.readText(filePath))),
  );
  const manifest = await readJson(reader, "package.json");
  const actionPath = ["action.yml", "action.yaml"].find((candidate) => files.includes(candidate));

  const proposals = [
    ...(manifest ? proposePackageAssertions(documents, "package.json", manifest) : []),
    ...(actionPath ? proposeActionExamples(documents, actionPath, packageName(manifest)) : []),
    ...(manifest ? proposeVersionReferences(documents, "package.json", version(manifest)) : []),
    ...proposeSchemaExamples(documents, files),
    ...proposeDocumentPairs(files),
    ...proposePathReferences(documents, files),
  ].filter((proposal) => !alreadyDeclared(proposal, existing));

  const selection = documentSelection(markdown);
  return { documents: selection, proposals: await cost(reader, selection, proposals), existing };
}

/**
 * Cost each proposal as the findings it adds to a baseline configuration that
 * declares only the document selection. Comparing two engine runs avoids
 * mapping rule identifiers back to the contract that produced them, and it
 * counts a contract's indirect cost — a document it brings into scope — the
 * same way a maintainer would experience it.
 */
async function cost(
  reader: RepositoryReader,
  documents: readonly string[],
  proposals: readonly ContractProposal[],
): Promise<CostedProposal[]> {
  if (proposals.length === 0) return [];
  const engine = new DocsentryVerificationEngine(reader);
  const base = { documents };
  const baseline = await engine.verify({ root: ".", config: base });

  return Promise.all(
    proposals.map(async (proposal) => {
      const report = await engine.verify({ root: ".", config: mergeFragments(base, [proposal.fragment]) });
      return {
        ...proposal,
        cost: {
          errors: Math.max(0, report.summary.errors - baseline.summary.errors),
          warnings: Math.max(0, report.summary.warnings - baseline.summary.warnings),
        },
      };
    }),
  );
}

/**
 * A selection that names each Markdown file at the repository root and covers
 * every directory that contains one, which is how these configurations are
 * written by hand.
 */
function documentSelection(markdown: readonly string[]): string[] {
  const roots = markdown.filter((filePath) => !filePath.includes("/"));
  const directories = new Set(
    markdown.filter((filePath) => filePath.includes("/")).map((filePath) => filePath.slice(0, filePath.indexOf("/"))),
  );
  return [
    ...roots.sort((left, right) => left.localeCompare(right)),
    ...[...directories].sort((left, right) => left.localeCompare(right)).map((directory) => `${directory}/**/*.md`),
  ];
}

function alreadyDeclared(proposal: ContractProposal, existing: DocsentryConfig | undefined): boolean {
  if (!existing) return false;
  const fragment = proposal.fragment;

  if (fragment.package?.assertions) {
    // One manifest value is worth asserting once. A second document that
    // restates it adds a contract without adding coverage, so an assertion is
    // matched on its evidence pointer rather than on the document as well.
    const declared = existing.package?.assertions ?? [];
    return fragment.package.assertions.every((assertion) =>
      declared.some((other) => other.evidence === assertion.evidence),
    );
  }
  if (fragment.actionExamples) {
    return fragment.actionExamples.every((example) =>
      (existing.actionExamples ?? []).some((other) => other.action === example.action && other.uses === example.uses),
    );
  }
  if (fragment.versionReferences) {
    return fragment.versionReferences.every((reference) =>
      (existing.versionReferences ?? []).some((other) => other.pattern === reference.pattern),
    );
  }
  if (fragment.schemaExamples) {
    return fragment.schemaExamples.every((example) =>
      (existing.schemaExamples ?? []).some((other) => other.schema === example.schema),
    );
  }
  if (fragment.documentPairs) {
    return fragment.documentPairs.every((pair) =>
      (existing.documentPairs ?? []).some((other) => other.canonical === pair.canonical && other.mirror === pair.mirror),
    );
  }
  if (fragment.pathReferences) return (existing.pathReferences ?? []).length > 0;
  return false;
}

async function hasConfig(reader: RepositoryReader, configPath: string | undefined): Promise<boolean> {
  return reader.exists(configPath ?? ".docsentry.json");
}

async function readJson(reader: RepositoryReader, filePath: string): Promise<unknown> {
  if (!(await reader.exists(filePath))) return undefined;
  try {
    return JSON.parse(await reader.readText(filePath));
  } catch {
    return undefined;
  }
}

function packageName(manifest: unknown): string | undefined {
  const name = record(manifest)?.name;
  return typeof name === "string" ? name : undefined;
}

function version(manifest: unknown): string {
  const value = record(manifest)?.version;
  return typeof value === "string" ? value : "";
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

function isMarkdown(filePath: string): boolean {
  return filePath.toLowerCase().endsWith(".md");
}
