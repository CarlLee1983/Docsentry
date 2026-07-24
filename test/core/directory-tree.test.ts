import { describe, expect, it } from "vitest";

import { DocsentryVerificationEngine } from "../../src/core/verify.js";
import { MemoryRepositoryReader } from "../../src/repository/memory-reader.js";

const fenced = (body: string): string => `# Layout\n\n\`\`\`text source-layout\n${body}\n\`\`\`\n`;

describe("directory tree contract", () => {
  it("reports an indented tree entry the repository does not contain", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          directoryTrees: [
            { documents: ["ARCHITECTURE.md"], fenceLabel: "source-layout", root: "src" },
          ],
        }),
        "ARCHITECTURE.md": fenced(["src/", "  core/", "    verify.ts", "    absent.ts"].join("\n")),
        "src/core/verify.ts": "",
      }),
    );

    const report = await engine.verify({ root: "." });

    expect(report.findings).toMatchObject([
      {
        rule: "DOC_TREE_PATH_MISSING",
        severity: "error",
        message: expect.stringContaining("src/core/absent.ts"),
        document: { path: "ARCHITECTURE.md", line: 7, column: 5 },
      },
    ]);
  });

  it("parses a box-drawing tree", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          directoryTrees: [
            { documents: ["ARCHITECTURE.md"], fenceLabel: "source-layout", root: "src" },
          ],
        }),
        "ARCHITECTURE.md": fenced(
          ["src/", "├── core/", "│   ├── verify.ts", "│   └── absent.ts", "└── cli/", "    └── index.ts"].join("\n"),
        ),
        "src/core/verify.ts": "",
        "src/cli/index.ts": "",
      }),
    );

    const report = await engine.verify({ root: "." });

    expect(report.findings).toMatchObject([
      {
        rule: "DOC_TREE_PATH_MISSING",
        message: expect.stringContaining("src/core/absent.ts"),
        document: { path: "ARCHITECTURE.md", line: 7 },
      },
    ]);
  });

  it("accepts a tree that matches the repository", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          directoryTrees: [
            { documents: ["ARCHITECTURE.md"], fenceLabel: "source-layout", root: "src" },
          ],
        }),
        "ARCHITECTURE.md": fenced(["src/", "  core/", "    verify.ts", "  cli/"].join("\n")),
        "src/core/verify.ts": "",
        "src/cli/index.ts": "",
      }),
    );

    await expect(engine.verify({ root: "." })).resolves.toMatchObject({ findings: [] });
  });

  it("ignores a fenced block without the configured label", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          directoryTrees: [
            { documents: ["ARCHITECTURE.md"], fenceLabel: "source-layout", root: "src" },
          ],
        }),
        "ARCHITECTURE.md": "```text\nsrc/\n  absent.ts\n```\n",
      }),
    );

    await expect(engine.verify({ root: "." })).resolves.toMatchObject({ findings: [] });
  });

  it("reports a repository file the tree omits in exact mode", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          directoryTrees: [
            { documents: ["ARCHITECTURE.md"], fenceLabel: "source-layout", root: "src", mode: "exact" },
          ],
        }),
        "ARCHITECTURE.md": fenced(["src/", "  core/", "    verify.ts"].join("\n")),
        "src/core/verify.ts": "",
        "src/core/undocumented.ts": "",
      }),
    );

    await expect(engine.verify({ root: "." })).resolves.toMatchObject({
      findings: [
        {
          rule: "DOC_TREE_PATH_UNDOCUMENTED",
          severity: "error",
          message: expect.stringContaining("src/core/undocumented.ts"),
          document: { path: "ARCHITECTURE.md", line: 3 },
        },
      ],
    });
  });

  it("treats a listed directory with no children as covering its files", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          directoryTrees: [
            { documents: ["ARCHITECTURE.md"], fenceLabel: "source-layout", root: "src", mode: "exact" },
          ],
        }),
        "ARCHITECTURE.md": fenced(["src/", "  core/", "    verify.ts", "    rules/"].join("\n")),
        "src/core/verify.ts": "",
        "src/core/rules/link.ts": "",
        "src/core/rules/path.ts": "",
      }),
    );

    await expect(engine.verify({ root: "." })).resolves.toMatchObject({ findings: [] });
  });

  it("excludes ignored files from exact comparison", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          directoryTrees: [
            {
              documents: ["ARCHITECTURE.md"],
              fenceLabel: "source-layout",
              root: "src",
              mode: "exact",
              ignore: ["**/*.generated.ts"],
            },
          ],
        }),
        "ARCHITECTURE.md": fenced(["src/", "  core/", "    verify.ts"].join("\n")),
        "src/core/verify.ts": "",
        "src/core/schema.generated.ts": "",
      }),
    );

    await expect(engine.verify({ root: "." })).resolves.toMatchObject({ findings: [] });
  });

  it("warns about a line it cannot place in the tree", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          directoryTrees: [
            { documents: ["ARCHITECTURE.md"], fenceLabel: "source-layout", root: "src" },
          ],
        }),
        "ARCHITECTURE.md": fenced(["src/", "  core/", "     verify.ts"].join("\n")),
        "src/core/verify.ts": "",
      }),
    );

    const report = await engine.verify({ root: "." });

    expect(report.findings).toMatchObject([
      { rule: "DOC_TREE_UNPARSED", severity: "warning", document: { path: "ARCHITECTURE.md", line: 6 } },
    ]);
    expect(report.summary).toEqual({ errors: 0, warnings: 1 });
  });

  it("strips trailing comments from tree entries", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          directoryTrees: [
            { documents: ["ARCHITECTURE.md"], fenceLabel: "source-layout", root: "src" },
          ],
        }),
        "ARCHITECTURE.md": fenced(["src/", "  core/", "    verify.ts    # engine implementation"].join("\n")),
        "src/core/verify.ts": "",
      }),
    );

    await expect(engine.verify({ root: "." })).resolves.toMatchObject({ findings: [] });
  });

  it("selects a tree document when a file below its root changes", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          documents: ["ARCHITECTURE.md", "docs/unrelated.md"],
          directoryTrees: [
            { documents: ["ARCHITECTURE.md"], fenceLabel: "source-layout", root: "src" },
          ],
        }),
        "ARCHITECTURE.md": fenced(["src/", "  core/", "    verify.ts", "    absent.ts"].join("\n")),
        "docs/unrelated.md": "[Unrelated missing document](missing.md)\n",
        "src/core/verify.ts": "",
      }),
    );

    const report = await engine.verify({ root: ".", changedPaths: ["src/core/verify.ts"] });

    expect(report.findings).toMatchObject([
      {
        rule: "DOC_TREE_PATH_MISSING",
        message: expect.stringContaining("src/core/absent.ts"),
        document: { path: "ARCHITECTURE.md", line: 7 },
      },
    ]);
  });

  it("rejects an unknown comparison mode", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          directoryTrees: [
            { documents: ["ARCHITECTURE.md"], fenceLabel: "source-layout", mode: "strict" },
          ],
        }),
      }),
    );

    await expect(engine.verify({ root: "." })).rejects.toThrow("mode supports declared-exists and exact");
  });

  it("rejects an unknown directory tree property", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          directoryTrees: [
            { documents: ["ARCHITECTURE.md"], fenceLabel: "source-layout", unsupported: true },
          ],
        }),
      }),
    );

    await expect(engine.verify({ root: "." })).rejects.toThrow("unknown property unsupported");
  });
});
