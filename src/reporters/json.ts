import type { VerificationReport } from "../core/finding.js";

export function renderJson(report: VerificationReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
