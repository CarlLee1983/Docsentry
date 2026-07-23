import type { Finding, VerificationReport } from "../core/finding.js";

export function renderTerminal(report: VerificationReport): string {
  const lines = report.findings.flatMap(renderFinding);
  lines.push(`${report.summary.errors} error(s), ${report.summary.warnings} warning(s)`);
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
