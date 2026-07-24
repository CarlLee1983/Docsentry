import { writeFile } from "node:fs/promises";
import path from "node:path";

import { suggestedConfig } from "./suggest.js";
import { NodeRepositoryReader } from "../repository/node-reader.js";

const defaultConfig = {
  "$schema": "./node_modules/@carllee1983/docsentry/schema.json",
  documents: ["README.md", "docs/**/*.md"],
};

export async function initialize(root: string, options: { suggest?: boolean } = {}): Promise<string> {
  const reader = new NodeRepositoryReader(root);
  const configPath = ".docsentry.json";
  if (await reader.exists(configPath)) {
    throw new Error(`${configPath} already exists; it was not changed.`);
  }
  const config = options.suggest ? await suggestedConfig(root) : defaultConfig;
  await writeFile(path.join(root, configPath), `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return configPath;
}
