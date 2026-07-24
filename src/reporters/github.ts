import type { StaleBaselineEntry } from "../core/baseline.js";
import type { Finding, VerificationReport } from "../core/finding.js";

/**
 * Render findings as GitHub Actions workflow commands, which the runner turns
 * into inline pull request annotations. This stays a pure reporter: it writes
 * to stdout and makes no API call, so the check remains deterministic and
 * needs no token.
 */
export function renderGithub(
  report: VerificationReport,
  stale: readonly StaleBaselineEntry[] = [],
): string {
  const lines = report.findings.map(renderAnnotation);
  const suppressed = report.summary.suppressed;
  const counts = `${report.summary.errors} error(s), ${report.summary.warnings} warning(s)`;
  lines.push(suppressed === undefined ? counts : `${counts}, ${suppressed} suppressed by baseline`);
  if (stale.length > 0) {
    const total = stale.reduce((sum, entry) => sum + entry.count, 0);
    lines.push(`${total} baseline suppression(s) no longer match; run docsentry baseline to refresh.`);
  }
  return `${lines.join("\n")}\n`;
}

function renderAnnotation(finding: Finding): string {
  const properties = [
    `file=${escapeProperty(finding.document.path)}`,
    `line=${finding.document.line}`,
    `col=${finding.document.column}`,
    `title=${escapeProperty(finding.rule)}`,
  ].join(",");

  const details = [finding.message];
  if (finding.evidence) {
    details.push(`Evidence: ${finding.evidence.path}${finding.evidence.pointer ?? ""}`);
  }
  if (finding.suggestion) details.push(`Suggestion: ${finding.suggestion}`);

  return `::${finding.severity} ${properties}::${escapeData(details.join("\n"))}`;
}

/** Workflow command data may not contain a raw newline or percent sign. */
function escapeData(value: string): string {
  return value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}

/** Property values additionally may not contain a colon or comma. */
function escapeProperty(value: string): string {
  return escapeData(value).replaceAll(":", "%3A").replaceAll(",", "%2C");
}
