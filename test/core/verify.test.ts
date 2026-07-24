import { describe, expect, it } from "vitest";

import { InvocationError } from "../../src/core/errors.js";
import { DocsentryVerificationEngine } from "../../src/core/verify.js";
import { parseMarkdown } from "../../src/documents/markdown.js";
import { MemoryRepositoryReader } from "../../src/repository/memory-reader.js";

describe("DocsentryVerificationEngine", () => {
  it("reports each independently addressable broken documentation contract", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          documents: ["README.md", "README.zh-TW.md"],
          package: { manifest: "package.json" },
          schemaExamples: [{ documents: ["README.md"], language: "json", schema: "schema.json" }],
          actionExamples: [{ documents: ["README.md"], action: "action.yml" }],
          documentPairs: [
            {
              canonical: "README.md",
              mirror: "README.zh-TW.md",
              requireSame: ["commands"],
            },
          ],
        }),
        "README.md": `# Docsentry

[Missing document](docs/missing.md)

\`\`\`sh
npm run removed
\`\`\`

\`\`\`json
{"enabled":"not-a-boolean"}
\`\`\`

\`\`\`yaml
jobs:
  verify:
    steps:
      - uses: local/action
        with:
          not-an-input: true
\`\`\`
`,
        "README.zh-TW.md": `# Docsentry

\`\`\`sh
echo different
\`\`\`
`,
        "package.json": JSON.stringify({ scripts: { test: "vitest" } }),
        "schema.json": JSON.stringify({
          type: "object",
          properties: { enabled: { type: "boolean" } },
          required: ["enabled"],
        }),
        "action.yml": "name: Test\ninputs:\n  known-input:\n    required: false\n",
      }),
    );

    const report = await engine.verify({ root: "." });

    expect(report.summary).toEqual({ errors: 5, warnings: 0 });
    expect(report.findings.map((finding) => finding.rule)).toEqual([
      "DOC_LINK_MISSING",
      "DOC_SCRIPT_UNKNOWN",
      "DOC_SCHEMA_INVALID",
      "DOC_ACTION_INPUT_UNKNOWN",
      "DOC_PAIR_COMMAND_MISMATCH",
    ]);
    expect(report.findings.map((finding) => finding.document.line)).toEqual([3, 6, 9, 19, 4]);
  });

  it("returns no finding for a valid local heading anchor and ignores external URLs", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        "README.md": "# Start here\n\n[Jump](#start-here)\n[Website](https://example.com)\n",
      }),
    );

    await expect(engine.verify({ root: "." })).resolves.toMatchObject({
      findings: [],
      summary: { errors: 0, warnings: 0 },
    });
  });

  it("treats malformed configuration as an invocation error", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({ ".docsentry.json": "{ invalid json" }),
    );

    await expect(engine.verify({ root: "." })).rejects.toBeInstanceOf(InvocationError);
  });

  it("accepts a schema declaration and rejects unknown configuration properties", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          $schema: "./node_modules/@carllee1983/docsentry/schema.json",
          documents: ["README.md"],
          unsupported: true,
        }),
        "README.md": "# Docsentry\n",
      }),
    );

    await expect(engine.verify({ root: "." })).rejects.toThrow("unknown property unsupported");
  });

  it("rejects a fence label containing whitespace", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          schemaExamples: [
            {
              documents: ["README.md"],
              language: "json",
              schema: "schema.json",
              fenceLabel: "two labels",
            },
          ],
        }),
      }),
    );

    await expect(engine.verify({ root: "." })).rejects.toThrow("fenceLabel must be one whitespace-free label");
  });

  it("rejects duplicate document-pair comparison selections", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          documentPairs: [
            {
              canonical: "README.md",
              mirror: "README.zh-TW.md",
              requireSame: ["commands", "commands"],
            },
          ],
        }),
      }),
    );

    await expect(engine.verify({ root: "." })).rejects.toThrow("must not contain duplicate values");
  });

  it("limits a changed Action definition check to its configured documentation examples", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          documents: ["README.md", "docs/action.md"],
          actionExamples: [{ documents: ["docs/action.md"], action: "action.yml" }],
        }),
        "README.md": "[Unrelated missing document](missing.md)\n",
        "docs/action.md": `\`\`\`yaml
jobs:
  verify:
    steps:
      - uses: local/action
        with:
          removed-input: true
\`\`\`
`,
        "action.yml": "name: Local action\ninputs:\n  current-input:\n    required: false\n",
      }),
    );

    const report = await engine.verify({ root: ".", changedPaths: ["action.yml"] });

    expect(report.findings).toMatchObject([
      { rule: "DOC_ACTION_INPUT_UNKNOWN", document: { path: "docs/action.md", line: 7, column: 11 } },
    ]);
  });

  it("validates only the configured Action reference and locates an unknown input key", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          actionExamples: [
            {
              documents: ["README.md"],
              action: "action.yml",
              uses: "CarlLee1983/Docsentry",
            },
          ],
        }),
        "README.md": `\`\`\`yaml
steps:
  - uses: actions/setup-node@v4
    with:
      node-version: 20
      not-an-input-for-this-action: true
  - uses: CarlLee1983/Docsentry@v0.5.0
    with:
      config: .docsentry.json
      misspelled-input: true
\`\`\`
`,
        "action.yml": "name: Docsentry\ninputs:\n  config:\n    required: false\n",
      }),
    );

    await expect(engine.verify({ root: "." })).resolves.toMatchObject({
      findings: [
        {
          rule: "DOC_ACTION_INPUT_UNKNOWN",
          message: expect.stringContaining('"misspelled-input"'),
          document: { path: "README.md", line: 10, column: 7 },
        },
      ],
      summary: { errors: 1, warnings: 0 },
    });
  });

  it("includes documents that link to a changed or deleted local target", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({ documents: ["README.md", "docs/unrelated.md"] }),
        "README.md": "[Removed asset](assets/logo.svg)\n",
        "docs/unrelated.md": "[Unrelated missing document](missing.md)\n",
      }),
    );

    const report = await engine.verify({ root: ".", changedPaths: ["assets/logo.svg"] });

    expect(report.findings).toMatchObject([
      { rule: "DOC_LINK_MISSING", document: { path: "README.md", line: 1 } },
    ]);
  });

  it("validates only fenced examples marked with a configured schema label", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          schemaExamples: [
            {
              documents: ["README.md"],
              language: "json",
              schema: "schema.json",
              fenceLabel: "docsentry-config",
            },
          ],
        }),
        "README.md": `\`\`\`json docsentry-config
{"tags":[]}
\`\`\`

\`\`\`json
{"schemaVersion":1,"ok":true}
\`\`\`
`,
        "schema.json": JSON.stringify({
          type: "object",
          required: ["tags"],
          properties: { tags: { type: "array" } },
        }),
      }),
    );

    await expect(engine.verify({ root: "." })).resolves.toMatchObject({ findings: [] });
  });

  it("keeps document-and-language schema selection when no fence label is configured", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          schemaExamples: [{ documents: ["README.md"], language: "json", schema: "schema.json" }],
        }),
        "README.md": `\`\`\`json docsentry-config
{"tags":[]}
\`\`\`

\`\`\`json
{"schemaVersion":1,"ok":true}
\`\`\`
`,
        "schema.json": JSON.stringify({
          type: "object",
          required: ["tags"],
          properties: { tags: { type: "array" } },
        }),
      }),
    );

    await expect(engine.verify({ root: "." })).resolves.toMatchObject({
      findings: [{ rule: "DOC_SCHEMA_INVALID", document: { path: "README.md", line: 5 } }],
    });
  });

  it("compares both documents in a pair when either one changes", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          documents: ["README.md", "docs/README.zh-TW.md"],
          documentPairs: [
            {
              canonical: "README.md",
              mirror: "docs/README.zh-TW.md",
              requireSame: ["commands"],
            },
          ],
        }),
        "README.md": "\`\`\`sh\nnpm run check\n\`\`\`\n",
        "docs/README.zh-TW.md": "\`\`\`sh\nnpm run test\n\`\`\`\n",
      }),
    );

    const report = await engine.verify({ root: ".", changedPaths: ["README.md"] });

    expect(report.findings).toMatchObject([
      { rule: "DOC_PAIR_COMMAND_MISMATCH", document: { path: "docs/README.zh-TW.md", line: 2 } },
    ]);
  });

  it("verifies a configuration supplied by the caller instead of reading one from disk", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": "{ this file would fail to parse",
        "package.json": JSON.stringify({ name: "@scope/package" }),
        "README.md": "# Package\n\nInstall `@scope/renamed` from the registry.\n",
      }),
    );

    const report = await engine.verify({
      root: ".",
      config: {
        documents: ["README.md"],
        package: {
          manifest: "package.json",
          assertions: [
            { document: "README.md", label: "published package name", value: "@scope/renamed", evidence: "/name" },
          ],
        },
      },
    });

    expect(report.findings).toMatchObject([
      { rule: "DOC_PACKAGE_ASSERTION_MISMATCH", document: { path: "README.md" } },
    ]);
  });

  it("rejects a request that both supplies a configuration and names one to read", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({ documents: ["README.md"] }),
        "README.md": "# Package\n",
      }),
    );

    await expect(
      engine.verify({ root: ".", config: { documents: ["README.md"] }, configPath: ".docsentry.json" }),
    ).rejects.toBeInstanceOf(InvocationError);
  });
});

describe("Markdown parser", () => {
  it("creates GitHub-compatible duplicate heading anchors with source locations", () => {
    const document = parseMarkdown("README.md", "# Repeat\n\n## Repeat\n");

    expect(document.headings).toMatchObject([
      { anchor: "repeat", path: ["Repeat"], location: { line: 1, column: 1 } },
      { anchor: "repeat-1", path: ["Repeat", "Repeat"], location: { line: 3, column: 1 } },
    ]);
  });

  it("extracts whitespace-separated labels from fenced code metadata", () => {
    const document = parseMarkdown("README.md", "\`\`\`json docsentry-config example\n{}\n\`\`\`\n");

    expect(document.codeBlocks).toMatchObject([
      { language: "json", fenceLabels: ["docsentry-config", "example"], location: { line: 1, column: 1 } },
    ]);
  });
});
