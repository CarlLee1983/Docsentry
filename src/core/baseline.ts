import { InvocationError } from "./errors.js";
import { createReport, type Finding, type VerificationReport } from "./finding.js";

export const BASELINE_VERSION = 1;

export type Baseline = {
  version: typeof BASELINE_VERSION;
  /**
   * Suppressed finding messages, keyed by document path and then rule
   * identifier. Messages identify which finding was suppressed; their count
   * still applies when wording changes between releases.
   */
  suppressions: Record<string, Record<string, readonly string[]>>;
};

export type StaleBaselineEntry = {
  document: string;
  rule: string;
  count: number;
};

export type BaselineResult = {
  report: VerificationReport;
  stale: readonly StaleBaselineEntry[];
};

/** Summarise a complete report as the messages it suppresses. */
export function createBaseline(report: VerificationReport): Baseline {
  const suppressions: Record<string, Record<string, string[]>> = {};
  for (const finding of report.findings) {
    const rules = (suppressions[finding.document.path] ??= {});
    (rules[finding.rule] ??= []).push(finding.message);
  }
  return { version: BASELINE_VERSION, suppressions };
}

/**
 * Suppress the findings a baseline recorded, in two stages per document and
 * rule.
 *
 * A finding whose message the baseline recorded is suppressed directly. Any
 * message left over is only reused for an unmatched finding when *no* finding
 * of that document and rule matched, which means the wording changed rather
 * than the problem. Without that condition, fixing one finding would silently
 * donate its suppression to a new one of the same rule.
 *
 * Findings are already ordered, so the same repository state always suppresses
 * the same findings.
 */
export function applyBaseline(report: VerificationReport, baseline: Baseline): BaselineResult {
  const groups = new Map<string, Finding[]>();
  for (const finding of report.findings) {
    const key = groupKey(finding.document.path, finding.rule);
    const existing = groups.get(key);
    if (existing) existing.push(finding);
    else groups.set(key, [finding]);
  }

  const kept: Finding[] = [];
  const stale: StaleBaselineEntry[] = [];
  let suppressed = 0;
  const unusedGroups = new Set(
    Object.entries(baseline.suppressions).flatMap(([document, rules]) =>
      Object.keys(rules).map((rule) => groupKey(document, rule)),
    ),
  );

  for (const [key, findings] of groups) {
    const { document, rule } = parseGroupKey(key);
    unusedGroups.delete(key);
    const pool = [...(baseline.suppressions[document]?.[rule] ?? [])];
    const unmatched: Finding[] = [];

    let exactMatches = 0;
    for (const finding of findings) {
      const index = pool.indexOf(finding.message);
      if (index === -1) {
        unmatched.push(finding);
        continue;
      }
      pool.splice(index, 1);
      exactMatches += 1;
      suppressed += 1;
    }

    const reusable = exactMatches === 0 ? Math.min(pool.length, unmatched.length) : 0;
    suppressed += reusable;
    kept.push(...unmatched.slice(reusable));
    if (pool.length - reusable > 0) stale.push({ document, rule, count: pool.length - reusable });
  }

  for (const key of unusedGroups) {
    const { document, rule } = parseGroupKey(key);
    const count = baseline.suppressions[document]?.[rule]?.length ?? 0;
    if (count > 0) stale.push({ document, rule, count });
  }
  stale.sort((left, right) => left.document.localeCompare(right.document) || left.rule.localeCompare(right.rule));

  const remainingReport = createReport(kept);
  return {
    report: { ...remainingReport, summary: { ...remainingReport.summary, suppressed } },
    stale,
  };
}

/** A document path may contain a space, so the key separator is a character it cannot hold. */
const KEY_SEPARATOR = "\u0000";

function groupKey(document: string, rule: string): string {
  return `${document}${KEY_SEPARATOR}${rule}`;
}

function parseGroupKey(key: string): { document: string; rule: string } {
  const separator = key.indexOf(KEY_SEPARATOR);
  return { document: key.slice(0, separator), rule: key.slice(separator + 1) };
}

export function parseBaseline(contents: string, source: string): Baseline {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch (error: unknown) {
    throw new InvocationError(`Cannot parse baseline ${source}: ${messageOf(error)}`);
  }
  if (!isRecord(parsed)) throw new InvocationError(`${source}: expected an object`);
  if (parsed.version !== BASELINE_VERSION) {
    throw new InvocationError(`${source}: unsupported baseline version ${String(parsed.version)}`);
  }
  if (!isRecord(parsed.suppressions)) throw new InvocationError(`${source}: suppressions must be an object`);

  const suppressions: Record<string, Record<string, readonly string[]>> = {};
  for (const [document, rules] of Object.entries(parsed.suppressions)) {
    if (!isRecord(rules)) throw new InvocationError(`${source}: suppressions.${document} must be an object`);
    const messages: Record<string, readonly string[]> = {};
    for (const [rule, recorded] of Object.entries(rules)) {
      if (
        !Array.isArray(recorded) ||
        recorded.length === 0 ||
        recorded.some((message) => typeof message !== "string")
      ) {
        throw new InvocationError(`${source}: suppressions.${document}.${rule} must be a non-empty array of strings`);
      }
      messages[rule] = recorded as string[];
    }
    suppressions[document] = messages;
  }
  return { version: BASELINE_VERSION, suppressions };
}

export function serializeBaseline(baseline: Baseline): string {
  const suppressions: Record<string, Record<string, readonly string[]>> = {};
  for (const document of Object.keys(baseline.suppressions).sort((left, right) => left.localeCompare(right))) {
    const rules = baseline.suppressions[document] ?? {};
    suppressions[document] = Object.fromEntries(
      Object.keys(rules)
        .sort((left, right) => left.localeCompare(right))
        .map((rule) => [rule, rules[rule] ?? []]),
    );
  }
  return `${JSON.stringify({ version: baseline.version, suppressions }, null, 2)}\n`;
}

/** Total number of findings a baseline suppresses. */
export function baselineSize(baseline: Baseline): number {
  return Object.values(baseline.suppressions)
    .flatMap((rules) => Object.values(rules))
    .reduce((total, messages) => total + messages.length, 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
