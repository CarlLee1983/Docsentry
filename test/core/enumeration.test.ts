import { describe, expect, it } from "vitest";

import { DocsentryVerificationEngine } from "../../src/core/verify.js";
import { MemoryRepositoryReader } from "../../src/repository/memory-reader.js";

const enumeration = (overrides: Record<string, unknown> = {}) => ({
  documents: ["SPEC.md"],
  label: "rule identifier",
  values: { sources: ["src/rules/*.ts"], pattern: '"(DOC_[A-Z_]+)"' },
  documented: { pattern: "DOC_[A-Z_]+" },
  ...overrides,
});

describe("enumeration contract", () => {
  it("reports a value the code defines but the document omits", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({ enumerations: [enumeration()] }),
        "SPEC.md": "# Rules\n\nThe rules are `DOC_LINK_MISSING` and `DOC_PATH_MISSING`.\n",
        "src/rules/link.ts": 'const rule = "DOC_LINK_MISSING";\n',
        "src/rules/path.ts": 'const rule = "DOC_PATH_MISSING";\n',
        "src/rules/tree.ts": 'const rule = "DOC_TREE_UNPARSED";\n',
      }),
    );

    await expect(engine.verify({ root: "." })).resolves.toMatchObject({
      findings: [
        {
          rule: "DOC_ENUM_UNDOCUMENTED",
          severity: "error",
          message: expect.stringContaining("DOC_TREE_UNPARSED"),
          document: { path: "SPEC.md", line: 1, column: 1 },
          evidence: { path: "src/rules/tree.ts" },
        },
      ],
    });
  });

  it("reports a documented value the code does not define, at its code span", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({ enumerations: [enumeration()] }),
        "SPEC.md": "# Rules\n\nThe rules are `DOC_LINK_MISSING`\nand `DOC_REMOVED_RULE`.\n",
        "src/rules/link.ts": 'const rule = "DOC_LINK_MISSING";\n',
      }),
    );

    await expect(engine.verify({ root: "." })).resolves.toMatchObject({
      findings: [
        {
          rule: "DOC_ENUM_UNKNOWN",
          severity: "error",
          message: expect.stringContaining("DOC_REMOVED_RULE"),
          document: { path: "SPEC.md", line: 4, column: 5 },
        },
      ],
    });
  });

  it("accepts a document that lists exactly the defined values", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({ enumerations: [enumeration()] }),
        "SPEC.md": "| Contract | Rules |\n| --- | --- |\n| Links | `DOC_LINK_MISSING`, `DOC_PATH_MISSING` |\n",
        "src/rules/link.ts": 'a = "DOC_LINK_MISSING"; b = "DOC_PATH_MISSING";\n',
      }),
    );

    await expect(engine.verify({ root: "." })).resolves.toMatchObject({ findings: [] });
  });

  it("limits the documented set to a configured section", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          enumerations: [enumeration({ documented: { pattern: "DOC_[A-Z_]+", section: "Rule identifiers" } })],
        }),
        "SPEC.md": [
          "# Spec",
          "",
          "Prose may mention `DOC_LINK_MISSING` anywhere.",
          "",
          "## Rule identifiers",
          "",
          "| Contract | Rules |",
          "| --- | --- |",
          "| Links | `DOC_LINK_MISSING` |",
          "",
          "## Later section",
          "",
          "An unrelated `DOC_GHOST_RULE` mention outside the table.",
          "",
        ].join("\n"),
        "src/rules/link.ts": 'a = "DOC_LINK_MISSING";\n',
      }),
    );

    await expect(engine.verify({ root: "." })).resolves.toMatchObject({ findings: [] });
  });

  it("reports a configured section the document does not contain", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          enumerations: [enumeration({ documented: { pattern: "DOC_[A-Z_]+", section: "Absent section" } })],
        }),
        "SPEC.md": "# Spec\n\n`DOC_LINK_MISSING`\n",
        "src/rules/link.ts": 'a = "DOC_LINK_MISSING";\n',
      }),
    );

    await expect(engine.verify({ root: "." })).resolves.toMatchObject({
      findings: [{ rule: "DOC_ENUM_SECTION_MISSING", severity: "error", document: { path: "SPEC.md", line: 1 } }],
    });
  });

  it("reports when no source file matches the configured patterns", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({ enumerations: [enumeration()] }),
        "SPEC.md": "# Rules\n\n`DOC_LINK_MISSING`\n",
      }),
    );

    await expect(engine.verify({ root: "." })).resolves.toMatchObject({
      findings: [{ rule: "DOC_ENUM_SOURCE_UNAVAILABLE", severity: "error", document: { path: "SPEC.md", line: 1 } }],
    });
  });

  it("selects the enumeration document when a source file changes", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          documents: ["SPEC.md", "docs/unrelated.md"],
          enumerations: [enumeration()],
        }),
        "SPEC.md": "# Rules\n\n`DOC_LINK_MISSING`\n",
        "docs/unrelated.md": "[Unrelated missing document](missing.md)\n",
        "src/rules/link.ts": 'a = "DOC_LINK_MISSING"; b = "DOC_ADDED_RULE";\n',
      }),
    );

    const report = await engine.verify({ root: ".", changedPaths: ["src/rules/link.ts"] });

    expect(report.findings).toMatchObject([
      { rule: "DOC_ENUM_UNDOCUMENTED", message: expect.stringContaining("DOC_ADDED_RULE") },
    ]);
  });

  it("rejects a value pattern that is not a valid expression", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          enumerations: [enumeration({ values: { sources: ["src/**"], pattern: "DOC_[" } })],
        }),
      }),
    );

    await expect(engine.verify({ root: "." })).rejects.toThrow("pattern must be a valid regular expression");
  });

  it("rejects an unknown enumeration property", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({ enumerations: [enumeration({ unsupported: true })] }),
      }),
    );

    await expect(engine.verify({ root: "." })).rejects.toThrow("unknown property unsupported");
  });
});
