import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { main } from "../../src/cli/index.js";

const workingDirectories: string[] = [];
const execFile = promisify(execFileCallback);

afterEach(async () => {
  await Promise.all(workingDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("docsentry CLI", () => {
  it("provides stable top-level and check command help without reading a repository", async () => {
    const output: string[] = [];

    expect(
      await main(["--help"], {
        stdout: (message) => output.push(message),
        stderr: () => undefined,
      }),
    ).toBe(0);
    expect(output.join("")).toBe(
      "Usage: docsentry <command> [options]\n\nCommands:\n  init                 Create a starter .docsentry.json configuration.\n  check [paths...]     Verify documentation contracts.\n  inspect <document>   Print extracted document facts.\n\nRun docsentry help <command> for command-specific options.\n",
    );

    output.splice(0);
    expect(
      await main(["check", "--help"], {
        stdout: (message) => output.push(message),
        stderr: () => undefined,
      }),
    ).toBe(0);
    expect(output.join("")).toContain("--format <format> Render terminal (default), json, or sarif output.");
  });

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

  it("returns a failing status and a SARIF 2.1.0 report for a documentation finding", async () => {
    const root = await fixture({ "README.md": "[Missing](missing.md)\n" });
    const output: string[] = [];
    const originalDirectory = process.cwd();
    process.chdir(root);
    try {
      expect(
        await main(["check", "--format", "sarif"], {
          stdout: (message) => output.push(message),
          stderr: () => undefined,
        }),
      ).toBe(1);

      expect(JSON.parse(output.join(""))).toMatchObject({
        version: "2.1.0",
        runs: [
          {
            tool: { driver: { name: "Docsentry", rules: [{ id: "DOC_LINK_MISSING" }] } },
            results: [
              {
                ruleId: "DOC_LINK_MISSING",
                level: "error",
                locations: [
                  { physicalLocation: { artifactLocation: { uri: "README.md", uriBaseId: "%SRCROOT%" } } },
                ],
              },
            ],
          },
        ],
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

  it("checks only the documents affected since the requested Git base", async () => {
    const root = await fixture({
      "README.md": "[Working link](docs/guide.md)\n",
      "docs/guide.md": "# Guide\n",
      "docs/unrelated.md": "[Unrelated missing document](missing.md)\n",
    });
    await git(root, "init");
    await git(root, "config", "user.email", "docsentry@example.test");
    await git(root, "config", "user.name", "Docsentry tests");
    await git(root, "add", ".");
    await git(root, "commit", "-m", "Initial documentation");
    const { stdout: base } = await git(root, "rev-parse", "HEAD");
    await writeFile(path.join(root, "README.md"), "[Missing document](missing.md)\n", "utf8");
    await git(root, "add", "README.md");
    await git(root, "commit", "-m", "Break the README link");

    const output: string[] = [];
    const originalDirectory = process.cwd();
    process.chdir(root);
    try {
      expect(
        await main(["check", "--changed", base.trim(), "--format", "json"], {
          stdout: (message) => output.push(message),
          stderr: () => undefined,
        }),
      ).toBe(1);

      expect(JSON.parse(output.join(""))).toMatchObject({
        findings: [{ rule: "DOC_LINK_MISSING", document: { path: "README.md", line: 1 } }],
        summary: { errors: 1, warnings: 0 },
      });
    } finally {
      process.chdir(originalDirectory);
    }
  });

  it("rejects combining --changed with an explicit document path", async () => {
    const errors: string[] = [];

    expect(
      await main(["check", "--changed", "origin/main", "README.md"], {
        stdout: () => undefined,
        stderr: (message) => errors.push(message),
      }),
    ).toBe(2);
    expect(errors.join("")).toContain("--changed cannot be combined with explicit document paths");
  });
});

async function fixture(files: Readonly<Record<string, string>>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "docsentry-"));
  workingDirectories.push(root);
  await Promise.all(
    Object.entries(files).map(async ([filePath, contents]) => {
      await mkdir(path.dirname(path.join(root, filePath)), { recursive: true });
      await writeFile(path.join(root, filePath), contents, "utf8");
    }),
  );
  return root;
}

async function readFixture(root: string, filePath: string): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  return readFile(path.join(root, filePath), "utf8");
}

async function git(root: string, ...arguments_: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFile("git", ["-C", root, ...arguments_], { encoding: "utf8" });
}
