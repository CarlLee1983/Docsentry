import { readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";

import { InvocationError, RepositoryPathError } from "../core/errors.js";
import { normalizeRepositoryPath } from "./path.js";
import type { RepositoryReader } from "./reader.js";

const ignoredDirectories = new Set([".git", "node_modules", "dist", "coverage"]);

export class NodeRepositoryReader implements RepositoryReader {
  readonly root: string;
  private readonly resolvedRoot: Promise<string>;

  constructor(root: string) {
    this.root = path.resolve(root);
    this.resolvedRoot = realpath(this.root);
  }

  async readText(relativePath: string): Promise<string> {
    return readFile(await this.toAbsolute(relativePath), "utf8");
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      await this.toAbsolute(relativePath);
      return true;
    } catch (error: unknown) {
      if (isMissing(error)) return false;
      throw error;
    }
  }

  async listFiles(): Promise<readonly string[]> {
    const files: string[] = [];
    const root = await this.resolvedRoot;
    await this.walk(root, root, files);
    return files.sort((left, right) => left.localeCompare(right));
  }

  private async walk(root: string, directory: string, files: string[]): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) {
          await this.walk(root, path.join(directory, entry.name), files);
        }
      } else if (entry.isFile()) {
        files.push(path.relative(root, path.join(directory, entry.name)).replaceAll(path.sep, "/"));
      }
    }
  }

  private async toAbsolute(relativePath: string): Promise<string> {
    const normalized = normalizeRepositoryPath(relativePath);
    const absolute = path.resolve(this.root, normalized);
    const relative = path.relative(this.root, absolute);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new InvocationError(`Path must stay inside the repository: ${relativePath}`);
    }
    const [root, resolvedPath] = await Promise.all([this.resolvedRoot, realpath(absolute)]);
    if (!isWithin(root, resolvedPath)) {
      throw new RepositoryPathError(`Path resolves outside the repository: ${relativePath}`);
    }
    return resolvedPath;
  }
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function isMissing(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && (error as NodeJS.ErrnoException).code === "ENOENT";
}
