import { describe, expect, it } from "vitest";

import { applyBaseline, createBaseline, parseBaseline, serializeBaseline } from "../../src/core/baseline.js";
import { InvocationError } from "../../src/core/errors.js";
import { createReport, type Finding } from "../../src/core/finding.js";

const finding = (rule: string, filePath: string, line: number, message = rule): Finding => ({
  rule,
  severity: "error",
  message,
  document: { path: filePath, line, column: 1 },
});

describe("baseline", () => {
  it("records the messages it suppresses per document and rule", () => {
    const report = createReport([
      finding("DOC_LINK_MISSING", "README.md", 3, "Target \"a.md\" does not exist."),
      finding("DOC_LINK_MISSING", "README.md", 9, "Target \"b.md\" does not exist."),
      finding("DOC_PATH_MISSING", "README.md", 5, "Path \"src/a.ts\" does not exist."),
      finding("DOC_LINK_MISSING", "docs/guide.md", 2, "Target \"c.md\" does not exist."),
    ]);

    expect(createBaseline(report)).toEqual({
      version: 1,
      suppressions: {
        "README.md": {
          DOC_LINK_MISSING: ["Target \"a.md\" does not exist.", "Target \"b.md\" does not exist."],
          DOC_PATH_MISSING: ["Path \"src/a.ts\" does not exist."],
        },
        "docs/guide.md": { DOC_LINK_MISSING: ["Target \"c.md\" does not exist."] },
      },
    });
  });

  it("keeps reporting a new finding after an older one of the same rule is fixed", () => {
    const baseline = createBaseline(
      createReport([
        finding("DOC_LINK_MISSING", "README.md", 3, "Target \"setup.md\" does not exist."),
        finding("DOC_LINK_MISSING", "README.md", 4, "Target \"contributing.md\" does not exist."),
      ]),
    );

    const afterFixAndRegression = createReport([
      finding("DOC_LINK_MISSING", "README.md", 4, "Target \"contributing.md\" does not exist."),
      finding("DOC_LINK_MISSING", "README.md", 6, "Target \"brand-new.md\" does not exist."),
    ]);

    const result = applyBaseline(afterFixAndRegression, baseline);

    expect(result.report.findings).toMatchObject([
      { rule: "DOC_LINK_MISSING", message: expect.stringContaining("brand-new.md") },
    ]);
    expect(result.report.summary).toEqual({ errors: 1, warnings: 0, suppressed: 1 });
    expect(result.stale).toEqual([{ document: "README.md", rule: "DOC_LINK_MISSING", count: 1 }]);
  });

  it("still suppresses when every message for a rule was reworded", () => {
    const baseline = createBaseline(
      createReport([
        finding("DOC_LINK_MISSING", "README.md", 3, "Target \"setup.md\" does not exist."),
        finding("DOC_LINK_MISSING", "README.md", 4, "Target \"contributing.md\" does not exist."),
      ]),
    );

    const reworded = createReport([
      finding("DOC_LINK_MISSING", "README.md", 3, "Link target \"setup.md\" is missing."),
      finding("DOC_LINK_MISSING", "README.md", 4, "Link target \"contributing.md\" is missing."),
    ]);

    const result = applyBaseline(reworded, baseline);

    expect(result.report.findings).toEqual([]);
    expect(result.report.summary).toEqual({ errors: 0, warnings: 0, suppressed: 2 });
  });

  it("suppresses recorded findings and keeps new ones", () => {
    const baseline = createBaseline(createReport([finding("DOC_LINK_MISSING", "README.md", 3)]));
    const report = createReport([
      finding("DOC_LINK_MISSING", "README.md", 3),
      finding("DOC_LINK_MISSING", "README.md", 12),
      finding("DOC_PATH_MISSING", "README.md", 20),
    ]);

    const result = applyBaseline(report, baseline);

    expect(result.report.findings).toMatchObject([
      { rule: "DOC_LINK_MISSING", document: { line: 12 } },
      { rule: "DOC_PATH_MISSING", document: { line: 20 } },
    ]);
    expect(result.report.summary).toEqual({ errors: 2, warnings: 0, suppressed: 1 });
  });

  it("suppresses a report that has not changed", () => {
    const report = createReport([
      finding("DOC_LINK_MISSING", "README.md", 3),
      finding("DOC_PATH_MISSING", "docs/guide.md", 8),
    ]);

    const result = applyBaseline(report, createBaseline(report));

    expect(result.report.findings).toEqual([]);
    expect(result.report.summary).toEqual({ errors: 0, warnings: 0, suppressed: 2 });
    expect(result.stale).toEqual([]);
  });

  it("reports baseline entries that no longer match", () => {
    const baseline = createBaseline(
      createReport([
        finding("DOC_LINK_MISSING", "README.md", 3),
        finding("DOC_LINK_MISSING", "README.md", 4),
        finding("DOC_PATH_MISSING", "removed.md", 1),
      ]),
    );

    const result = applyBaseline(createReport([finding("DOC_LINK_MISSING", "README.md", 3)]), baseline);

    expect(result.stale).toEqual([
      { document: "README.md", rule: "DOC_LINK_MISSING", count: 1 },
      { document: "removed.md", rule: "DOC_PATH_MISSING", count: 1 },
    ]);
  });

  it("counts a suppressed warning without changing the error status", () => {
    const warning: Finding = { ...finding("DOC_TREE_UNPARSED", "ARCHITECTURE.md", 5), severity: "warning" };
    const report = createReport([warning, finding("DOC_LINK_MISSING", "README.md", 1)]);

    const result = applyBaseline(report, createBaseline(createReport([warning])));

    expect(result.report.summary).toEqual({ errors: 1, warnings: 0, suppressed: 1 });
  });

  it("parses a baseline document", () => {
    const text = JSON.stringify({ version: 1, suppressions: { "README.md": { DOC_LINK_MISSING: ["missing a.md"] } } });

    expect(parseBaseline(text, ".docsentry-baseline.json")).toEqual({
      version: 1,
      suppressions: { "README.md": { DOC_LINK_MISSING: ["missing a.md"] } },
    });
  });

  it("rejects a malformed baseline", () => {
    const baseline = (suppressions: unknown) => JSON.stringify({ version: 1, suppressions });

    expect(() => parseBaseline("{ invalid", "b.json")).toThrow(InvocationError);
    expect(() => parseBaseline(JSON.stringify({ version: 2, suppressions: {} }), "b.json")).toThrow(
      "unsupported baseline version 2",
    );
    expect(() => parseBaseline(JSON.stringify({ version: 1 }), "b.json")).toThrow(InvocationError);
    expect(() => parseBaseline(baseline({ "README.md": { DOC_LINK_MISSING: [] } }), "b.json")).toThrow(InvocationError);
    expect(() => parseBaseline(baseline({ "README.md": { DOC_LINK_MISSING: 2 } }), "b.json")).toThrow(InvocationError);
    expect(() => parseBaseline(baseline({ "README.md": { DOC_LINK_MISSING: [3] } }), "b.json")).toThrow(
      InvocationError,
    );
  });

  it("round-trips through serialization", () => {
    const baseline = createBaseline(
      createReport([
        finding("DOC_PATH_MISSING", "docs/guide.md", 2, "Path \"src/z.ts\" does not exist."),
        finding("DOC_LINK_MISSING", "README.md", 3, "Target \"a.md\" does not exist."),
      ]),
    );

    expect(parseBaseline(serializeBaseline(baseline), "b.json")).toEqual(baseline);
  });
});
