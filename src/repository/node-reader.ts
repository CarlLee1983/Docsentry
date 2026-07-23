import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { InvocationError } from "../core/errors.js";
import { normalizeRepositoryPath } from "./path.js";
import type { RepositoryReader } from "./reader.js";

const ignoredDirectories = new Set([".git", "node_modules", "dist", "coverage"]);

export class NodeRepositoryReader implements RepositoryReader {
  readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  async readText(relativePath: string): Promise<string> {
    return readFile(this.toAbsolute(relativePath), "utf8");
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      await stat(this.toAbsolute(relativePath));
      return true;
    } catch (error: unknown) {
      if (isMissing(error)) return false;
      throw error;
    }
  }

  async listFiles(): Promise<readonly string[]> {
    const files: string[] = [];
    await this.walk(this.root, files);
    return files.sort((left, right) => left.localeCompare(right));
  }

  private async walk(directory: string, files: string[]): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) {
          await this.walk(path.join(directory, entry.name), files);
        }
      } else if (entry.isFile()) {
        files.push(path.relative(this.root, path.join(directory, entry.name)).replaceAll(path.sep, "/"));
      }
    }
  }

  private toAbsolute(relativePath: string): string {
    const normalized = normalizeRepositoryPath(relativePath);
    const absolute = path.resolve(this.root, normalized);
    const relative = path.relative(this.root, absolute);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new InvocationError(`Path must stay inside the repository: ${relativePath}`);
    }
    return absolute;
  }
}

function isMissing(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && (error as NodeJS.ErrnoException).code === "ENOENT";
}
