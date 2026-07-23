import type { Finding, VerificationReport } from "../core/finding.js";

const SARIF_SCHEMA = "https://json.schemastore.org/sarif-2.1.0.json";

/**
 * Renders a SARIF 2.1.0 log suitable for GitHub Code Scanning and other SARIF
 * consumers. Source paths remain relative to the checked-out repository.
 */
export function renderSarif(report: VerificationReport): string {
  const rules = [...new Set(report.findings.map((finding) => finding.rule))]
    .sort((left, right) => left.localeCompare(right))
    .map((id) => ({
      id,
      name: id,
      shortDescription: { text: ruleDescription(id) },
    }));

  return `${JSON.stringify(
    {
      $schema: SARIF_SCHEMA,
      version: "2.1.0",
      runs: [
        {
          tool: {
            driver: {
              name: "Docsentry",
              informationUri: "https://github.com/CarlLee1983/Docsentry",
              rules,
            },
          },
          results: report.findings.map(renderFinding),
        },
      ],
    },
    null,
    2,
  )}\n`;
}

function renderFinding(finding: Finding): Record<string, unknown> {
  return {
    ruleId: finding.rule,
    level: finding.severity,
    message: { text: finding.message },
    locations: [
      {
        physicalLocation: sourceLocation(finding.document.path, finding.document.line, finding.document.column),
      },
    ],
    ...(finding.evidence
      ? {
        relatedLocations: [
          {
            id: 1,
            message: {
              text: `Evidence: ${finding.evidence.path}${finding.evidence.pointer ?? ""}`,
            },
            physicalLocation: sourceLocation(finding.evidence.path, finding.evidence.line),
          },
        ],
      }
      : {}),
    ...(finding.suggestion ? { properties: { suggestion: finding.suggestion } } : {}),
  };
}

function sourceLocation(path: string, line?: number, column?: number): Record<string, unknown> {
  return {
    artifactLocation: {
      uri: toUri(path),
      uriBaseId: "%SRCROOT%",
    },
    ...(line === undefined ? {} : { region: { startLine: line, ...(column === undefined ? {} : { startColumn: column }) } }),
  };
}

function toUri(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function ruleDescription(rule: string): string {
  return rule.replaceAll("_", " ").toLowerCase();
}
