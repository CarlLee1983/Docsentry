import { loadConfig, matchesPatterns, type DocsentryConfig } from "./config.js";
import { createReport, type VerificationReport } from "./finding.js";
import { validateActionExamples } from "./rules/action.js";
import { validateLinks } from "./rules/link.js";
import { validateDocumentPairs } from "./rules/pair.js";
import { validatePackageContracts } from "./rules/package.js";
import { validateStructuredExamples } from "./rules/structured.js";
import { validateVersionReferences } from "./rules/version.js";
import { parseMarkdown, type DocumentFact } from "../documents/markdown.js";
import { NodeRepositoryReader } from "../repository/node-reader.js";
import { normalizeRepositoryPath, resolveRepositoryPath } from "../repository/path.js";
import type { RepositoryReader } from "../repository/reader.js";

export type VerificationRequest = {
  root: string;
  documents?: readonly string[];
  configPath?: string;
  /** Paths selected by an opt-in trusted change detector, such as Git. */
  changedPaths?: readonly string[];
};

export interface VerificationEngine {
  verify(request: VerificationRequest): Promise<VerificationReport>;
}

export class DocsentryVerificationEngine implements VerificationEngine {
  constructor(private readonly reader: RepositoryReader) {}

  async verify(request: VerificationRequest): Promise<VerificationReport> {
    const config = await loadConfig(this.reader, request.configPath);
    const documents = request.changedPaths
      ? this.selectChangedDocuments(
        await this.loadSelectedDocuments(undefined, config),
        config,
        request.changedPaths,
        request.configPath ?? ".docsentry.json",
      )
      : await this.loadSelectedDocuments(request.documents, config);
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

    const scopedConfig = request.changedPaths ? configForDocuments(config, documents) : config;
    const [linkFindings, packageFindings, structuredFindings, actionFindings, pairFindings, versionFindings] =
      await Promise.all([
        validateLinks(documents, this.reader, loadDocument),
        validatePackageContracts(documents, scopedConfig, this.reader, loadDocument),
        validateStructuredExamples(documents, scopedConfig, this.reader),
        validateActionExamples(documents, scopedConfig, this.reader),
        validateDocumentPairs(scopedConfig, loadDocument),
        validateVersionReferences(documents, scopedConfig, this.reader),
      ]);
    return createReport([
      ...linkFindings,
      ...packageFindings,
      ...structuredFindings,
      ...actionFindings,
      ...pairFindings,
      ...versionFindings,
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
    for (const reference of config.versionReferences ?? []) {
      addMatches(selected, markdownFiles, reference.documents);
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

  private selectChangedDocuments(
    candidates: readonly DocumentFact[],
    config: DocsentryConfig,
    changedPaths: readonly string[],
    configPath: string,
  ): DocumentFact[] {
    const changed = new Set(changedPaths.map(normalizeRepositoryPath));
    const selected = new Set<string>();
    const selectAll = () => candidates.forEach((document) => selected.add(document.path));
    const selectMatching = (patterns: readonly string[]) =>
      candidates
        .filter((document) => matchesPatterns(document.path, patterns))
        .forEach((document) => selected.add(document.path));

    candidates
      .filter((document) => changed.has(document.path))
      .forEach((document) => selected.add(document.path));

    if (changed.has(normalizeRepositoryPath(configPath))) selectAll();
    if (config.package && changed.has(normalizeRepositoryPath(config.package.manifest ?? "package.json"))) {
      selectAll();
    }
    for (const schemaExample of config.schemaExamples ?? []) {
      if (changed.has(normalizeRepositoryPath(schemaExample.schema))) selectMatching(schemaExample.documents);
    }
    for (const actionExample of config.actionExamples ?? []) {
      if (changed.has(normalizeRepositoryPath(actionExample.action))) selectMatching(actionExample.documents);
    }
    for (const reference of config.versionReferences ?? []) {
      if (changed.has(normalizeRepositoryPath(reference.manifest ?? "package.json"))) {
        selectMatching(reference.documents);
      }
    }
    for (const pair of config.documentPairs ?? []) {
      const canonical = normalizeRepositoryPath(pair.canonical);
      const mirror = normalizeRepositoryPath(pair.mirror);
      if (changed.has(canonical) || changed.has(mirror)) {
        selected.add(canonical);
        selected.add(mirror);
      }
    }

    for (const document of candidates) {
      if (document.links.some((link) => linkTargetsChangedPath(document.path, link.url, changed))) {
        selected.add(document.path);
      }
    }

    return candidates.filter((document) => selected.has(document.path));
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

function configForDocuments(config: DocsentryConfig, documents: readonly DocumentFact[]): DocsentryConfig {
  const selected = new Set(documents.map((document) => document.path));
  return {
    ...config,
    package: config.package && {
      ...config.package,
      assertions: config.package.assertions?.filter((assertion) => selected.has(normalizeRepositoryPath(assertion.document))),
    },
    schemaExamples: config.schemaExamples?.filter((example) =>
      documents.some((document) => matchesPatterns(document.path, example.documents)),
    ),
    actionExamples: config.actionExamples?.filter((example) =>
      documents.some((document) => matchesPatterns(document.path, example.documents)),
    ),
    documentPairs: config.documentPairs?.filter((pair) =>
      selected.has(normalizeRepositoryPath(pair.canonical)) || selected.has(normalizeRepositoryPath(pair.mirror)),
    ),
    versionReferences: config.versionReferences?.filter((reference) =>
      documents.some((document) => matchesPatterns(document.path, reference.documents)),
    ),
  };
}

function linkTargetsChangedPath(documentPath: string, url: string, changedPaths: ReadonlySet<string>): boolean {
  if (!url || /^([A-Za-z][A-Za-z\d+.-]*:|\/\/)/.test(url)) return false;
  const hashIndex = url.indexOf("#");
  const rawPath = (hashIndex === -1 ? url : url.slice(0, hashIndex)).split("?", 1)[0] ?? "";
  try {
    const targetPath = rawPath ? resolveRepositoryPath(documentPath, decodeURIComponent(rawPath)) : documentPath;
    return changedPaths.has(targetPath);
  } catch {
    return false;
  }
}
