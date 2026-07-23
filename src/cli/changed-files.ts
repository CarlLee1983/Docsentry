import { execFile } from "node:child_process";

import { InvocationError } from "../core/errors.js";
import { normalizeRepositoryPath } from "../repository/path.js";

/**
 * Returns repository-relative paths changed from the merge base of `base` and
 * HEAD. Deletions are deliberately included so link checks can report inbound
 * links to a removed document or asset.
 */
export async function changedFiles(root: string, base: string): Promise<readonly string[]> {
  if (!base || base.startsWith("-")) {
    throw new InvocationError("--changed requires a Git revision that does not start with '-'");
  }

  const output = await runGit(root, base);
  return [...new Set(
    output
      .split("\0")
      .filter((filePath) => filePath.length > 0)
      .map(normalizeRepositoryPath),
  )].sort((left, right) => left.localeCompare(right));
}

async function runGit(root: string, base: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const process = execFile(
      "git",
      ["-C", root, "diff", "--name-only", "--no-renames", "--diff-filter=ACMRD", "-z", `${base}...HEAD`, "--"],
      { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (!error) {
          resolve(stdout);
          return;
        }
        const detail = stderr.trim() || error.message;
        reject(new InvocationError(`Cannot determine changed files from Git: ${detail}`));
      },
    );
    process.on("error", (error) => {
      reject(new InvocationError(`Cannot determine changed files from Git: ${error.message}`));
    });
  });
}
