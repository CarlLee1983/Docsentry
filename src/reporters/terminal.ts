import type { StaleBaselineEntry } from "../core/baseline.js";
import type { Finding, VerificationReport } from "../core/finding.js";

export function renderTerminal(report: VerificationReport, stale: readonly StaleBaselineEntry[] = []): string {
  const lines = report.findings.flatMap(renderFinding);
  const suppressed = report.summary.suppressed;
  const counts = `${report.summary.errors} error(s), ${report.summary.warnings} warning(s)`;
  lines.push(suppressed === undefined ? counts : `${counts}, ${suppressed} suppressed by baseline`);
  if (stale.length > 0) {
    const total = stale.reduce((sum, entry) => sum + entry.count, 0);
    lines.push(`${total} baseline suppression(s) no longer match; run docsentry baseline to refresh.`);
  }
  return `${lines.join("\n")}\n`;
}

function renderFinding(finding: Finding): string[] {
  const lines = [
    `${finding.document.path}:${finding.document.line}:${finding.document.column}  ${finding.severity.toUpperCase()}  ${finding.rule}`,
    `  ${finding.message}`,
  ];
  if (finding.evidence) {
    const pointer = finding.evidence.pointer ?? "";
    lines.push(`  Evidence: ${finding.evidence.path}${pointer}`);
  }
  if (finding.suggestion) lines.push(`  Suggestion: ${finding.suggestion}`);
  return lines;
}
