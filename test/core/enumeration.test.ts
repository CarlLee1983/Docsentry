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

  it("collects values from a JSON pointer to an array", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          enumerations: [
            enumeration({
              label: "diagnostic code",
              values: { manifest: "output.schema.json", pointer: "/definitions/code/enum" },
              documented: { pattern: "[a-z][a-z-]+" },
            }),
          ],
        }),
        "SPEC.md": "# Codes\n\nThe codes are `pattern-mismatch` and `orphan-tag`.\n",
        "output.schema.json": JSON.stringify({
          definitions: {
            code: { enum: ["pattern-mismatch", "orphan-tag", "duplicate-version"] },
            unrelated: { enum: ["major", "minor"] },
          },
        }),
      }),
    );

    await expect(engine.verify({ root: "." })).resolves.toMatchObject({
      findings: [
        {
          rule: "DOC_ENUM_UNDOCUMENTED",
          message: expect.stringContaining("duplicate-version"),
          evidence: { path: "output.schema.json", pointer: "/definitions/code/enum" },
        },
      ],
    });
  });

  it("collects the keys of a YAML mapping a pointer selects", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          enumerations: [
            enumeration({
              label: "Action input",
              values: { manifest: "action.yml", pointer: "/inputs" },
              documented: { pattern: "[a-z][a-z-]+" },
            }),
          ],
        }),
        "SPEC.md": "# Inputs\n\nSupported inputs are `config` and `format`.\n",
        "action.yml": "name: Docsentry\ninputs:\n  config:\n    required: false\n  format:\n    required: false\n",
      }),
    );

    await expect(engine.verify({ root: "." })).resolves.toMatchObject({ findings: [] });
  });

  it("merges several pointers into one documented set", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          enumerations: [
            enumeration({
              label: "diagnostic code",
              values: {
                manifest: "output.schema.json",
                pointer: ["/definitions/code/enum", "/definitions/checkCode/enum"],
              },
              documented: { pattern: "[a-z][a-z-]+", section: "Diagnostic codes" },
            }),
          ],
        }),
        "SPEC.md": [
          "# Spec",
          "",
          "## Diagnostic codes",
          "",
          "| Group | Codes |",
          "| --- | --- |",
          "| Anomalies | `pattern-mismatch`, `orphan-tag` |",
          "",
          "The readiness checks use a separate set (`release-branch`, `release-worktree`).",
          "",
        ].join("\n"),
        "output.schema.json": JSON.stringify({
          definitions: {
            code: { enum: ["pattern-mismatch", "orphan-tag"] },
            checkCode: { enum: ["release-branch", "release-worktree"] },
          },
        }),
      }),
    );

    await expect(engine.verify({ root: "." })).resolves.toMatchObject({ findings: [] });
  });

  it("reports an unusable pointer as unavailable evidence", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          enumerations: [
            enumeration({
              values: { manifest: "output.schema.json", pointer: "/definitions/absent" },
              documented: { pattern: "[a-z-]+" },
            }),
          ],
        }),
        "SPEC.md": "# Codes\n\n`pattern-mismatch`\n",
        "output.schema.json": JSON.stringify({ definitions: {} }),
      }),
    );

    await expect(engine.verify({ root: "." })).resolves.toMatchObject({
      findings: [{ rule: "DOC_ENUM_SOURCE_UNAVAILABLE", document: { path: "SPEC.md", line: 1 } }],
    });
  });

  it("reports a missing manifest as unavailable evidence", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          enumerations: [
            enumeration({
              values: { manifest: "absent.json", pointer: "/enum" },
              documented: { pattern: "[a-z-]+" },
            }),
          ],
        }),
        "SPEC.md": "# Codes\n\n`pattern-mismatch`\n",
      }),
    );

    await expect(engine.verify({ root: "." })).resolves.toMatchObject({
      findings: [{ rule: "DOC_ENUM_SOURCE_UNAVAILABLE" }],
    });
  });

  it("selects the document when a pointer manifest changes", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          documents: ["SPEC.md", "docs/unrelated.md"],
          enumerations: [
            enumeration({
              values: { manifest: "output.schema.json", pointer: "/enum" },
              documented: { pattern: "[a-z][a-z-]+" },
            }),
          ],
        }),
        "SPEC.md": "# Codes\n\n`pattern-mismatch`\n",
        "docs/unrelated.md": "[Unrelated missing document](missing.md)\n",
        "output.schema.json": JSON.stringify({ enum: ["pattern-mismatch", "added-code"] }),
      }),
    );

    const report = await engine.verify({ root: ".", changedPaths: ["output.schema.json"] });

    expect(report.findings).toMatchObject([
      { rule: "DOC_ENUM_UNDOCUMENTED", message: expect.stringContaining("added-code") },
    ]);
  });

  it("rejects an enumeration that declares both evidence forms", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          enumerations: [
            enumeration({ values: { sources: ["src/**"], pattern: "x", manifest: "a.json", pointer: "/enum" } }),
          ],
        }),
      }),
    );

    await expect(engine.verify({ root: "." })).rejects.toThrow(
      "values must declare either sources and pattern, or manifest and pointer",
    );
  });

  it("rejects an enumeration that declares neither evidence form", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({ enumerations: [enumeration({ values: {} })] }),
      }),
    );

    await expect(engine.verify({ root: "." })).rejects.toThrow(
      "values must declare either sources and pattern, or manifest and pointer",
    );
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
