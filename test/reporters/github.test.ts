import { describe, expect, it } from "vitest";

import { renderGithub } from "../../src/reporters/github.js";

describe("GitHub reporter", () => {
  it("renders one workflow command per finding, with evidence and suggestion", () => {
    const output = renderGithub({
      findings: [
        {
          rule: "DOC_SCRIPT_UNKNOWN",
          severity: "error",
          message: 'Documented script "verify" does not exist in package.json.',
          document: { path: "README.md", line: 12, column: 3 },
          evidence: { path: "package.json", pointer: "/scripts/verify" },
          suggestion: "Use an existing script name.",
        },
      ],
      summary: { errors: 1, warnings: 0 },
    });

    expect(output).toBe(
      "::error file=README.md,line=12,col=3,title=DOC_SCRIPT_UNKNOWN::" +
        'Documented script "verify" does not exist in package.json.' +
        "%0AEvidence: package.json/scripts/verify%0ASuggestion: Use an existing script name.\n" +
        "1 error(s), 0 warning(s)\n",
    );
  });

  it("maps a warning to a warning command", () => {
    const output = renderGithub({
      findings: [
        {
          rule: "DOC_TREE_UNPARSED",
          severity: "warning",
          message: "Tree entry was skipped.",
          document: { path: "ARCHITECTURE.md", line: 5, column: 1 },
        },
      ],
      summary: { errors: 0, warnings: 1 },
    });

    expect(output).toContain("::warning file=ARCHITECTURE.md,line=5,col=1,title=DOC_TREE_UNPARSED::");
  });

  it("escapes characters that would terminate a workflow command", () => {
    const output = renderGithub({
      findings: [
        {
          rule: "DOC_ENUM_UNKNOWN",
          severity: "error",
          message: "Values a, b\nand 100% of c are unknown.",
          document: { path: "docs/a,b: c.md", line: 1, column: 1 },
        },
      ],
      summary: { errors: 1, warnings: 0 },
    });

    expect(output).toContain("file=docs/a%2Cb%3A c.md");
    expect(output).toContain("::Values a, b%0Aand 100%25 of c are unknown.");
    expect(output).not.toContain("\nand 100%");
  });

  it("reports the summary and baseline counts without any finding", () => {
    const output = renderGithub({ findings: [], summary: { errors: 0, warnings: 0, suppressed: 4 } });

    expect(output).toBe("0 error(s), 0 warning(s), 4 suppressed by baseline\n");
  });

  it("names stale baseline entries after the annotations", () => {
    const output = renderGithub({ findings: [], summary: { errors: 0, warnings: 0, suppressed: 1 } }, [
      { document: "README.md", rule: "DOC_LINK_MISSING", count: 2 },
    ]);

    expect(output).toContain("2 baseline suppression(s) no longer match");
  });
});
