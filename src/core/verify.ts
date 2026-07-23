import { loadConfig, matchesPatterns, type DocsentryConfig } from "./config.js";
import { createReport, type VerificationReport } from "./finding.js";
import { validateActionExamples } from "./rules/action.js";
import { validateLinks } from "./rules/link.js";
import { validateDocumentPairs } from "./rules/pair.js";
import { validatePackageContracts } from "./rules/package.js";
import { validateStructuredExamples } from "./rules/structured.js";
import { parseMarkdown, type DocumentFact } from "../documents/markdown.js";
import { NodeRepositoryReader } from "../repository/node-reader.js";
import { normalizeRepositoryPath } from "../repository/path.js";
import type { RepositoryReader } from "../repository/reader.js";

export type VerificationRequest = {
  root: string;
  documents?: readonly string[];
  configPath?: string;
};

export interface VerificationEngine {
  verify(request: VerificationRequest): Promise<VerificationReport>;
}

export class DocsentryVerificationEngine implements VerificationEngine {
  constructor(private readonly reader: RepositoryReader) {}

  async verify(request: VerificationRequest): Promise<VerificationReport> {
    const config = await loadConfig(this.reader, request.configPath);
    const documents = await this.loadSelectedDocuments(request.documents, config);
    const cache = new Map(documents.map((document) => [document.path, document]));
    const loadDocument = async (filePath: string): Promise<DocumentFact> => {
      const normalized = normalizeRepositoryPath(filePath);
      const cached = cache.get(normalized);
      if (cached) return cached;
      const contents = await this.reader.readText(normalized);
      const document = parseMarkdown(normalized, contents);
      cache.set(normalized, document);
      return document;
    };

    const [linkFindings, packageFindings, structuredFindings, actionFindings, pairFindings] = await Promise.all([
      validateLinks(documents, this.reader, loadDocument),
      validatePackageContracts(documents, config, this.reader, loadDocument),
      validateStructuredExamples(documents, config, this.reader),
      validateActionExamples(documents, config, this.reader),
      validateDocumentPairs(config, loadDocument),
    ]);
    return createReport([
      ...linkFindings,
      ...packageFindings,
      ...structuredFindings,
      ...actionFindings,
      ...pairFindings,
    ]);
  }

  private async loadSelectedDocuments(
    requestedDocuments: readonly string[] | undefined,
    config: DocsentryConfig,
  ): Promise<DocumentFact[]> {
    const files = await this.reader.listFiles();
    const markdownFiles = files.filter(isMarkdown);
    const selected = new Set<string>();
    const selection = requestedDocuments ?? config.documents;

    if (selection) addMatches(selected, markdownFiles, selection);
    else markdownFiles.forEach((filePath) => selected.add(filePath));

    for (const schemaExample of config.schemaExamples ?? []) {
      addMatches(selected, markdownFiles, schemaExample.documents);
    }
    for (const actionExample of config.actionExamples ?? []) {
      addMatches(selected, markdownFiles, actionExample.documents);
    }
    for (const pair of config.documentPairs ?? []) {
      addIfExistingMarkdown(selected, markdownFiles, pair.canonical);
      addIfExistingMarkdown(selected, markdownFiles, pair.mirror);
    }
    for (const assertion of config.package?.assertions ?? []) {
      addIfExistingMarkdown(selected, markdownFiles, assertion.document);
    }

    return Promise.all(
      [...selected]
        .sort((left, right) => left.localeCompare(right))
        .map(async (filePath) => parseMarkdown(filePath, await this.reader.readText(filePath))),
    );
  }
}

export async function verifyRepository(request: VerificationRequest): Promise<VerificationReport> {
  return new DocsentryVerificationEngine(new NodeRepositoryReader(request.root)).verify(request);
}

function addMatches(selected: Set<string>, files: readonly string[], patterns: readonly string[]): void {
  for (const pattern of patterns) {
    if (isMarkdown(pattern) && files.includes(pattern)) {
      selected.add(pattern);
    } else {
      files.filter((filePath) => matchesPatterns(filePath, [pattern])).forEach((filePath) => selected.add(filePath));
    }
  }
}

function addIfExistingMarkdown(selected: Set<string>, files: readonly string[], filePath: string): void {
  const normalized = normalizeRepositoryPath(filePath);
  if (isMarkdown(normalized) && files.includes(normalized)) selected.add(normalized);
}

function isMarkdown(filePath: string): boolean {
  return filePath.toLowerCase().endsWith(".md");
}
