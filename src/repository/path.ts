import path from "node:path";

import { InvocationError } from "../core/errors.js";

export function normalizeRepositoryPath(input: string): string {
  const normalized = path.posix.normalize(input.replaceAll("\\", "/"));
  if (
    !input ||
    path.posix.isAbsolute(normalized) ||
    normalized === ".." ||
    normalized.startsWith("../")
  ) {
    throw new InvocationError(`Path must stay inside the repository: ${input}`);
  }
  return normalized.replace(/^\.\//, "");
}

export function resolveRepositoryPath(fromFile: string, target: string): string {
  const base = target.startsWith("/") ? "" : path.posix.dirname(fromFile);
  return normalizeRepositoryPath(path.posix.join(base, target));
}
