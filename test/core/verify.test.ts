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
    expect(report.findings.map((finding) => finding.document.line)).toEqual([3, 6, 9, 13, 4]);
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
});

describe("Markdown parser", () => {
  it("creates GitHub-compatible duplicate heading anchors with source locations", () => {
    const document = parseMarkdown("README.md", "# Repeat\n\n## Repeat\n");

    expect(document.headings).toMatchObject([
      { anchor: "repeat", path: ["Repeat"], location: { line: 1, column: 1 } },
      { anchor: "repeat-1", path: ["Repeat", "Repeat"], location: { line: 3, column: 1 } },
    ]);
  });
});
