import { writeFile } from "node:fs/promises";
import path from "node:path";

import { baselineSize, createBaseline, parseBaseline, serializeBaseline, type Baseline } from "../core/baseline.js";
import { InvocationError } from "../core/errors.js";
import { verifyRepository } from "../core/verify.js";
import { NodeRepositoryReader } from "../repository/node-reader.js";
import { normalizeRepositoryPath } from "../repository/path.js";

export const DEFAULT_BASELINE_PATH = ".docsentry-baseline.json";

/** Record the repository's current findings, replacing any existing baseline. */
export async function writeBaseline(
  root: string,
  options: { configPath?: string; outputPath?: string },
): Promise<{ path: string; size: number }> {
  const outputPath = normalizeRepositoryPath(options.outputPath ?? DEFAULT_BASELINE_PATH);
  const report = await verifyRepository({ root, configPath: options.configPath });
  const baseline = createBaseline(report);
  await writeFile(path.join(root, outputPath), serializeBaseline(baseline), "utf8");
  return { path: outputPath, size: baselineSize(baseline) };
}

/**
 * Load the baseline a check should apply. An explicit path must exist; the
 * default path is applied when present, matching how `.docsentry.json` is
 * discovered.
 */
export async function resolveBaseline(root: string, baselinePath?: string): Promise<Baseline | undefined> {
  const normalized = normalizeRepositoryPath(baselinePath ?? DEFAULT_BASELINE_PATH);
  const reader = new NodeRepositoryReader(root);
  if (!(await reader.exists(normalized))) {
    if (baselinePath) throw new InvocationError(`Baseline file does not exist: ${baselinePath}`);
    return undefined;
  }
  return parseBaseline(await reader.readText(normalized), normalized);
}
