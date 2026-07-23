import { normalizeRepositoryPath } from "./path.js";
import type { RepositoryReader } from "./reader.js";

export class MemoryRepositoryReader implements RepositoryReader {
  private readonly files: ReadonlyMap<string, string>;

  constructor(files: Readonly<Record<string, string>>) {
    this.files = new Map(
      Object.entries(files).map(([filePath, contents]) => [normalizeRepositoryPath(filePath), contents]),
    );
  }

  async readText(filePath: string): Promise<string> {
    const contents = this.files.get(normalizeRepositoryPath(filePath));
    if (contents === undefined) throw new Error(`File not found: ${filePath}`);
    return contents;
  }

  async exists(filePath: string): Promise<boolean> {
    return this.files.has(normalizeRepositoryPath(filePath));
  }

  async listFiles(): Promise<readonly string[]> {
    return [...this.files.keys()].sort((left, right) => left.localeCompare(right));
  }
}
