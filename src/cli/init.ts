import { writeFile } from "node:fs/promises";
import path from "node:path";

import { NodeRepositoryReader } from "../repository/node-reader.js";

const defaultConfig = {
  documents: ["README.md", "docs/**/*.md"],
};

export async function initialize(root: string): Promise<string> {
  const reader = new NodeRepositoryReader(root);
  const configPath = ".docsentry.json";
  if (await reader.exists(configPath)) {
    throw new Error(`${configPath} already exists; it was not changed.`);
  }
  await writeFile(path.join(root, configPath), `${JSON.stringify(defaultConfig, null, 2)}\n`, "utf8");
  return configPath;
}
