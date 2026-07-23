import { describe, expect, it } from "vitest";

import { renderSarif } from "../../src/reporters/sarif.js";

describe("SARIF reporter", () => {
  it("maps findings, evidence, and suggestions to a SARIF 2.1.0 result", () => {
    const report = JSON.parse(
      renderSarif({
        findings: [
          {
            rule: "DOC_SCRIPT_UNKNOWN",
            severity: "error",
            message: 'Script "verify" does not exist.',
            document: { path: "docs/Getting started.md", line: 12, column: 3 },
            evidence: { path: "package.json", pointer: "/scripts", line: 5 },
            suggestion: "Add the script or update the command.",
          },
        ],
        summary: { errors: 1, warnings: 0 },
      }),
    );

    expect(report).toMatchObject({
      $schema: "https://json.schemastore.org/sarif-2.1.0.json",
      version: "2.1.0",
      runs: [
        {
          tool: {
            driver: {
              name: "Docsentry",
              rules: [{ id: "DOC_SCRIPT_UNKNOWN", shortDescription: { text: "doc script unknown" } }],
            },
          },
          results: [
            {
              ruleId: "DOC_SCRIPT_UNKNOWN",
              level: "error",
              message: { text: 'Script "verify" does not exist.' },
              locations: [
                {
                  physicalLocation: {
                    artifactLocation: { uri: "docs/Getting%20started.md", uriBaseId: "%SRCROOT%" },
                    region: { startLine: 12, startColumn: 3 },
                  },
                },
              ],
              relatedLocations: [
                {
                  id: 1,
                  message: { text: "Evidence: package.json/scripts" },
                  physicalLocation: {
                    artifactLocation: { uri: "package.json", uriBaseId: "%SRCROOT%" },
                    region: { startLine: 5 },
                  },
                },
              ],
              properties: { suggestion: "Add the script or update the command." },
            },
          ],
        },
      ],
    });
  });

  it("emits a valid empty SARIF run when verification succeeds", () => {
    const report = JSON.parse(renderSarif({ findings: [], summary: { errors: 0, warnings: 0 } }));

    expect(report.runs[0].tool.driver.rules).toEqual([]);
    expect(report.runs[0].results).toEqual([]);
  });
});
