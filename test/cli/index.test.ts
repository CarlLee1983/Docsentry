import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { main } from "../../src/cli/index.js";

const workingDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(workingDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("docsentry CLI", () => {
  it("returns a failing status and the JSON report for a documentation finding", async () => {
    const root = await fixture({ "README.md": "[Missing](missing.md)\n" });
    const output: string[] = [];
    const errors: string[] = [];
    const originalDirectory = process.cwd();
    process.chdir(root);
    try {
      const exitCode = await main(["check", "--format", "json"], {
        stdout: (message) => output.push(message),
        stderr: (message) => errors.push(message),
      });

      expect(exitCode).toBe(1);
      expect(errors).toEqual([]);
      expect(JSON.parse(output.join(""))).toMatchObject({
        findings: [{ rule: "DOC_LINK_MISSING", document: { path: "README.md", line: 1 } }],
        summary: { errors: 1, warnings: 0 },
      });
    } finally {
      process.chdir(originalDirectory);
    }
  });

  it("writes a starter configuration without overwriting an existing one", async () => {
    const root = await fixture({ "README.md": "# Read me\n" });
    const output: string[] = [];
    const originalDirectory = process.cwd();
    process.chdir(root);
    try {
      expect(await main(["init"], { stdout: (message) => output.push(message), stderr: () => undefined })).toBe(0);
      expect(JSON.parse(await readFixture(root, ".docsentry.json"))).toEqual({
        $schema: "./node_modules/@carllee1983/docsentry/schema.json",
        documents: ["README.md", "docs/**/*.md"],
      });
      expect(output.join("")).toBe("Created .docsentry.json\n");

      const error: string[] = [];
      expect(await main(["init"], { stdout: () => undefined, stderr: (message) => error.push(message) })).toBe(2);
      expect(error.join("")).toContain("already exists; it was not changed");
    } finally {
      process.chdir(originalDirectory);
    }
  });
});

async function fixture(files: Readonly<Record<string, string>>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "docsentry-"));
  workingDirectories.push(root);
  await Promise.all(
    Object.entries(files).map(async ([filePath, contents]) => {
      await writeFile(path.join(root, filePath), contents, "utf8");
    }),
  );
  return root;
}

async function readFixture(root: string, filePath: string): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  return readFile(path.join(root, filePath), "utf8");
}
