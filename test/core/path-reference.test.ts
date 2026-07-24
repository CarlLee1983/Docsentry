import { describe, expect, it } from "vitest";

import { DocsentryVerificationEngine } from "../../src/core/verify.js";
import { parseMarkdown } from "../../src/documents/markdown.js";
import { MemoryRepositoryReader } from "../../src/repository/memory-reader.js";

describe("path reference contract", () => {
  it("reports an inline path that the repository does not contain", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          documents: ["ARCHITECTURE.md"],
          pathReferences: [{ documents: ["ARCHITECTURE.md"], include: ["src/**"] }],
        }),
        "ARCHITECTURE.md": "The engine lives in `src/core/verify.ts` and `src/cli/check.ts`.\n",
        "src/core/verify.ts": "",
      }),
    );

    const report = await engine.verify({ root: "." });

    expect(report.findings).toMatchObject([
      {
        rule: "DOC_PATH_MISSING",
        severity: "error",
        message: expect.stringContaining("src/cli/check.ts"),
        document: { path: "ARCHITECTURE.md", line: 1, column: 46 },
      },
    ]);
  });

  it("ignores inline code outside the configured path patterns", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          pathReferences: [{ documents: ["README.md"], include: ["src/**"] }],
        }),
        "README.md": "Run `npm run build`, edit `package.json`, then read `docs/guide.md`.\n",
      }),
    );

    await expect(engine.verify({ root: "." })).resolves.toMatchObject({ findings: [] });
  });

  it("ignores an inline glob pattern rather than treating it as a path", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          pathReferences: [{ documents: ["README.md"], include: ["docs/**", "src/**"] }],
        }),
        "README.md": "Select `docs/**/*.md` or `src/*.ts` to check every document.\n",
      }),
    );

    await expect(engine.verify({ root: "." })).resolves.toMatchObject({ findings: [] });
  });

  it("resolves an inline path against the repository root, not the document", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          pathReferences: [{ documents: ["docs/guide.md"], include: ["src/**"] }],
        }),
        "docs/guide.md": "The entry point is `src/cli/index.ts`.\n",
        "src/cli/index.ts": "",
      }),
    );

    await expect(engine.verify({ root: "." })).resolves.toMatchObject({ findings: [] });
  });

  it("accepts a directory reference that contains repository files", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          pathReferences: [{ documents: ["README.md"], include: ["src/**"] }],
        }),
        "README.md": "Rules live under `src/core/rules/`.\n",
        "src/core/rules/link.ts": "",
      }),
    );

    await expect(engine.verify({ root: "." })).resolves.toMatchObject({ findings: [] });
  });

  it("reports a directory reference with no repository files", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          pathReferences: [{ documents: ["README.md"], include: ["src/**"] }],
        }),
        "README.md": "Adapters live under `src/adapters/`.\n",
        "src/core/rules/link.ts": "",
      }),
    );

    await expect(engine.verify({ root: "." })).resolves.toMatchObject({
      findings: [{ rule: "DOC_PATH_MISSING", document: { path: "README.md", line: 1 } }],
    });
  });

  it("removes an excluded path from the selection", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          pathReferences: [
            { documents: ["README.md"], include: ["*.json"], exclude: [".docsentry-baseline.json"] },
          ],
        }),
        "README.md": "Run baseline to write `.docsentry-baseline.json`, then edit `.absent.json`.\n",
      }),
    );

    await expect(engine.verify({ root: "." })).resolves.toMatchObject({
      findings: [{ rule: "DOC_PATH_MISSING", message: expect.stringContaining(".absent.json") }],
    });
  });

  it("ignores an angle-bracket placeholder template", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          pathReferences: [{ documents: ["CONTRIBUTING.md"], include: ["src/**"] }],
        }),
        "CONTRIBUTING.md": "Add a model as `src/core/models/<name>.ts` next to `src/core/config.ts`.\n",
        "src/core/config.ts": "",
      }),
    );

    await expect(engine.verify({ root: "." })).resolves.toMatchObject({ findings: [] });
  });

  it("treats a bare file extension as prose but still checks a dotted repository file", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          pathReferences: [{ documents: ["README.md"], include: ["*.json", "*.md"] }],
        }),
        "README.md": "Markdown (`.md`) documents are configured in `.docsentry.json` or `.absent.json`.\n",
      }),
    );

    await expect(engine.verify({ root: "." })).resolves.toMatchObject({
      findings: [
        {
          rule: "DOC_PATH_MISSING",
          message: expect.stringContaining(".absent.json"),
          document: { path: "README.md", line: 1 },
        },
      ],
    });
  });

  it("ignores a path reference in a document the configuration does not select", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          documents: ["README.md", "docs/notes.md"],
          pathReferences: [{ documents: ["README.md"], include: ["src/**"] }],
        }),
        "README.md": "# Docsentry\n",
        "docs/notes.md": "A scratch idea for `src/future/idea.ts`.\n",
      }),
    );

    await expect(engine.verify({ root: "." })).resolves.toMatchObject({ findings: [] });
  });

  it("selects documents that reference a deleted path", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          documents: ["README.md", "docs/unrelated.md"],
          pathReferences: [{ documents: ["README.md"], include: ["src/**"] }],
        }),
        "README.md": "The removed adapter was `src/removed.ts`.\n",
        "docs/unrelated.md": "[Unrelated missing document](missing.md)\n",
      }),
    );

    const report = await engine.verify({ root: ".", changedPaths: ["src/removed.ts"] });

    expect(report.findings).toMatchObject([
      { rule: "DOC_PATH_MISSING", document: { path: "README.md", line: 1 } },
    ]);
  });

  it("rejects an unknown path reference property", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          pathReferences: [{ documents: ["README.md"], include: ["src/**"], unsupported: true }],
        }),
      }),
    );

    await expect(engine.verify({ root: "." })).rejects.toThrow("unknown property unsupported");
  });
});

describe("Markdown parser code spans", () => {
  it("extracts inline code with source locations", () => {
    const document = parseMarkdown("README.md", "Read `src/index.ts` before `npm test`.\n");

    expect(document.codeSpans).toMatchObject([
      { value: "src/index.ts", location: { line: 1, column: 6 } },
      { value: "npm test", location: { line: 1, column: 28 } },
    ]);
  });
});
