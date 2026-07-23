export type Severity = "error" | "warning";

export type SourceLocation = {
  path: string;
  line: number;
  column: number;
};

export type EvidenceLocation = {
  path: string;
  pointer?: string;
  line?: number;
};

export type Finding = {
  rule: string;
  severity: Severity;
  message: string;
  document: SourceLocation;
  evidence?: EvidenceLocation;
  suggestion?: string;
};

export type VerificationReport = {
  findings: readonly Finding[];
  summary: { errors: number; warnings: number };
};

export function orderFindings(findings: readonly Finding[]): Finding[] {
  return [...findings].sort((left, right) =>
    left.document.path.localeCompare(right.document.path) ||
    left.document.line - right.document.line ||
    left.document.column - right.document.column ||
    left.rule.localeCompare(right.rule),
  );
}

export function createReport(findings: readonly Finding[]): VerificationReport {
  const ordered = orderFindings(findings);
  return {
    findings: ordered,
    summary: {
      errors: ordered.filter((finding) => finding.severity === "error").length,
      warnings: ordered.filter((finding) => finding.severity === "warning").length,
    },
  };
}
