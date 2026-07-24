import { describe, expect, it } from "vitest";

import { proposeActionExamples } from "../../src/core/proposals/action.js";
import { proposeDocumentPairs } from "../../src/core/proposals/pair.js";
import { proposePackageAssertions } from "../../src/core/proposals/package.js";
import { proposePathReferences } from "../../src/core/proposals/path.js";
import { proposeSchemaExamples } from "../../src/core/proposals/structured.js";
import { proposeVersionReferences } from "../../src/core/proposals/version.js";
import { parseMarkdown } from "../../src/documents/markdown.js";

function documents(files: Readonly<Record<string, string>>) {
  return Object.entries(files).map(([filePath, contents]) => parseMarkdown(filePath, contents));
}

describe("package assertion proposals", () => {
  it("proposes an assertion for a manifest value a document already restates", () => {
    const proposals = proposePackageAssertions(
      documents({ "README.md": "# Package\n\nInstall `@scope/package` to begin.\n" }),
      "package.json",
      { name: "@scope/package", version: "1.0.0" },
    );

    expect(proposals).toMatchObject([
      {
        section: "package",
        fragment: {
          package: {
            manifest: "package.json",
            assertions: [{ document: "README.md", value: "@scope/package", evidence: "/name" }],
          },
        },
      },
    ]);
    expect(proposals[0].justification).toContain("package.json");
  });

  it("proposes the Node engine range when a document states it", () => {
    const proposals = proposePackageAssertions(
      documents({ "README.md": "# Package\n\nRequires Node.js `>=22`.\n" }),
      "package.json",
      { name: "@scope/package", engines: { node: ">=22" } },
    );

    expect(proposals).toMatchObject([
      {
        fragment: {
          package: { assertions: [{ document: "README.md", value: ">=22", evidence: "/engines/node" }] },
        },
      },
    ]);
  });

  it("proposes nothing when no document restates a manifest value", () => {
    const proposals = proposePackageAssertions(
      documents({ "README.md": "# Package\n\nInstall it with `npm install`.\n" }),
      "package.json",
      { name: "@scope/package", engines: { node: ">=22" } },
    );

    expect(proposals).toEqual([]);
  });

  it("prefers README.md when several documents restate the value", () => {
    const proposals = proposePackageAssertions(
      documents({
        "docs/guide.md": "Install `@scope/package`.\n",
        "README.md": "Install `@scope/package`.\n",
      }),
      "package.json",
      { name: "@scope/package" },
    );

    expect(proposals).toMatchObject([
      { fragment: { package: { assertions: [{ document: "README.md" }] } } },
    ]);
  });

  it("recognises a value stated in a fenced block, as the rule does", () => {
    const proposals = proposePackageAssertions(
      documents({ "README.md": "# Widget\n\n```sh\nnpm install @scope/widget\n```\n" }),
      "package.json",
      { name: "@scope/widget" },
    );

    expect(proposals).toMatchObject([
      { fragment: { package: { assertions: [{ document: "README.md", value: "@scope/widget" }] } } },
    ]);
  });

  it("proposes nothing for bin, whose pointer reaches a path rather than the command name", () => {
    const proposals = proposePackageAssertions(
      documents({ "README.md": "Run `widget`, which lives at `dist/cli/index.js`.\n" }),
      "package.json",
      { bin: { widget: "dist/cli/index.js" } },
    );

    expect(proposals).toEqual([]);
  });

  it("prefers a document other than the changelog, whose values may be historical", () => {
    const proposals = proposePackageAssertions(
      documents({
        "CHANGELOG.md": "Renamed to `@scope/widget`.\n",
        "GUIDE.md": "Install `@scope/widget`.\n",
      }),
      "package.json",
      { name: "@scope/widget" },
    );

    expect(proposals).toMatchObject([
      { fragment: { package: { assertions: [{ document: "GUIDE.md" }] } } },
    ]);
  });

  it("proposes nothing for a manifest that is not an object", () => {
    expect(proposePackageAssertions(documents({ "README.md": "`x`\n" }), "package.json", null)).toEqual([]);
  });

  it("falls back to path order when no README restates the value", () => {
    const proposals = proposePackageAssertions(
      documents({
        "docs/reference.md": "Install `@scope/package`.\n",
        "docs/guide.md": "Install `@scope/package`.\n",
      }),
      "package.json",
      { name: "@scope/package" },
    );

    expect(proposals).toMatchObject([
      { fragment: { package: { assertions: [{ document: "docs/guide.md" }] } } },
    ]);
  });
});

describe("Action example proposals", () => {
  const workflow = (reference: string) =>
    `# Package\n\n\`\`\`yaml\njobs:\n  verify:\n    steps:\n      - uses: actions/checkout@v4\n      - uses: ${reference}\n        with:\n          config: .docsentry.json\n\`\`\`\n`;

  it("proposes the repository's own Action, scoped by its uses reference", () => {
    const proposals = proposeActionExamples(
      documents({ "README.md": workflow("CarlLee1983/Widget@v1.2.0") }),
      "action.yml",
      "@carllee1983/widget",
    );

    expect(proposals).toMatchObject([
      {
        section: "actionExamples",
        fragment: {
          actionExamples: [{ documents: ["README.md"], action: "action.yml", uses: "CarlLee1983/Widget" }],
        },
      },
    ]);
  });

  it("proposes nothing when no workflow example references this repository's Action", () => {
    const proposals = proposeActionExamples(
      documents({ "README.md": workflow("someone/other@v3") }),
      "action.yml",
      "@carllee1983/widget",
    );

    expect(proposals).toEqual([]);
  });

  it("collects every document that shows the Action", () => {
    const proposals = proposeActionExamples(
      documents({
        "README.md": workflow("CarlLee1983/Widget@v1.2.0"),
        "docs/usage.md": workflow("CarlLee1983/Widget@v1.2.0"),
      }),
      "action.yml",
      "@carllee1983/widget",
    );

    expect(proposals).toMatchObject([
      { fragment: { actionExamples: [{ documents: ["README.md", "docs/usage.md"] }] } },
    ]);
  });
});

describe("version reference proposals", () => {
  it("rewrites a version literal that already equals the manifest version", () => {
    const proposals = proposeVersionReferences(
      documents({ "README.md": "# Widget\n\n```yaml\n- uses: CarlLee1983/Widget@v1.2.0\n```\n" }),
      "package.json",
      "1.2.0",
    );

    expect(proposals).toMatchObject([
      {
        section: "versionReferences",
        fragment: {
          versionReferences: [
            { documents: ["README.md"], pattern: "CarlLee1983/Widget@v{version}", required: true },
          ],
        },
      },
    ]);
  });

  it("ignores a version literal whose prefix would match unrelated text", () => {
    const proposals = proposeVersionReferences(
      documents({ "CHANGELOG.md": "# Changelog\n\n## v1.2.0 — 2026-07-25\n\nReleased.\n" }),
      "package.json",
      "1.2.0",
    );

    expect(proposals).toEqual([]);
  });

  it("ignores a version that does not match the manifest", () => {
    const proposals = proposeVersionReferences(
      documents({ "README.md": "Install `@scope/widget@0.1.0`.\n" }),
      "package.json",
      "1.2.0",
    );

    expect(proposals).toEqual([]);
  });

  it("proposes one contract per distinct pattern, listing every document", () => {
    const proposals = proposeVersionReferences(
      documents({
        "README.md": "Install `@scope/widget@1.2.0` and use `CarlLee1983/Widget@v1.2.0`.\n",
        "docs/usage.md": "Install `@scope/widget@1.2.0`.\n",
      }),
      "package.json",
      "1.2.0",
    );

    expect(proposals).toMatchObject([
      { fragment: { versionReferences: [{ pattern: "@scope/widget@{version}", documents: ["README.md", "docs/usage.md"] }] } },
      { fragment: { versionReferences: [{ pattern: "CarlLee1983/Widget@v{version}", documents: ["README.md"] }] } },
    ]);
  });
});

describe("path reference proposals", () => {
  it("derives include patterns from code spans that already resolve to files", () => {
    const proposals = proposePathReferences(
      documents({ "README.md": "See `src/core/verify.ts` and `package.json`.\n" }),
      ["README.md", "package.json", "src/core/verify.ts"],
    );

    expect(proposals).toMatchObject([
      {
        section: "pathReferences",
        fragment: { pathReferences: [{ documents: ["README.md"], include: ["*.json", "src/**"] }] },
      },
    ]);
  });

  it("covers a documented top-level directory recursively", () => {
    const proposals = proposePathReferences(
      documents({ "README.md": "Tests live in `test`.\n" }),
      ["README.md", "test/cli/index.test.ts"],
    );

    expect(proposals).toMatchObject([
      { fragment: { pathReferences: [{ include: ["test/**"] }] } },
    ]);
  });

  it("ignores code spans that are commands, globs, or placeholders", () => {
    const proposals = proposePathReferences(
      documents({ "README.md": "Run `npm run build` over `docs/**/*.md` for `src/models/<name>.ts`.\n" }),
      ["README.md", "docs/guide.md", "src/models/widget.ts"],
    );

    expect(proposals).toEqual([]);
  });

  it("proposes nothing when no code span resolves to a committed file", () => {
    const proposals = proposePathReferences(
      documents({ "README.md": "See `src/core/gone.ts`.\n" }),
      ["README.md", "src/core/verify.ts"],
    );

    expect(proposals).toEqual([]);
  });
});

describe("document pair proposals", () => {
  it("pairs a translated document with its canonical original", () => {
    const proposals = proposeDocumentPairs(["README.md", "docs/README.zh-TW.md", "package.json"]);

    expect(proposals).toMatchObject([
      {
        section: "documentPairs",
        fragment: {
          documentPairs: [{ canonical: "README.md", mirror: "docs/README.zh-TW.md", requireSame: ["commands"] }],
        },
      },
    ]);
  });

  it("prefers a canonical document in the same directory", () => {
    const proposals = proposeDocumentPairs(["README.md", "docs/guide.md", "docs/guide.ja.md"]);

    expect(proposals).toMatchObject([
      { fragment: { documentPairs: [{ canonical: "docs/guide.md", mirror: "docs/guide.ja.md" }] } },
    ]);
  });

  it("proposes nothing when the canonical document is absent", () => {
    expect(proposeDocumentPairs(["docs/README.zh-TW.md"])).toEqual([]);
  });

  it("does not treat an ordinary dotted filename as a translation", () => {
    expect(proposeDocumentPairs(["notes.md", "notes.draft.md"])).toEqual([]);
  });
});

describe("schema example proposals", () => {
  it("proposes validating fenced JSON examples against a local schema", () => {
    const proposals = proposeSchemaExamples(
      documents({ "README.md": "# Widget\n\n```json\n{\"a\":1}\n```\n" }),
      ["README.md", "schema.json"],
    );

    expect(proposals).toMatchObject([
      {
        section: "schemaExamples",
        fragment: { schemaExamples: [{ documents: ["README.md"], language: "json", schema: "schema.json" }] },
      },
    ]);
  });

  it("proposes nothing when the repository has no schema", () => {
    expect(
      proposeSchemaExamples(documents({ "README.md": "```json\n{}\n```\n" }), ["README.md"]),
    ).toEqual([]);
  });

  it("proposes nothing when no document contains a JSON example", () => {
    expect(proposeSchemaExamples(documents({ "README.md": "# Widget\n" }), ["README.md", "schema.json"])).toEqual([]);
  });
});
