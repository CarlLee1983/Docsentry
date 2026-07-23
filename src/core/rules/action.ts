import type { DocsentryConfig } from "../config.js";
import { matchesPatterns } from "../config.js";
import type { Finding } from "../finding.js";
import type { DocumentFact } from "../../documents/markdown.js";
import { readActionInputs, workflowWithKeys } from "../../evidence/github-action.js";
import { parseStructuredBlock } from "../../evidence/structured.js";
import type { RepositoryReader } from "../../repository/reader.js";

export async function validateActionExamples(
  documents: readonly DocumentFact[],
  config: DocsentryConfig,
  reader: RepositoryReader,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const actions = new Map<string, ActionResult>();
  for (const actionExample of config.actionExamples ?? []) {
    const selectedBlocks = documents.flatMap((document) =>
      matchesPatterns(document.path, actionExample.documents)
        ? document.codeBlocks.filter(isYaml).map((block) => ({ document, block }))
        : [],
    );
    if (selectedBlocks.length === 0) continue;
    const action = await loadAction(reader, actionExample.action, actions);
    for (const { block } of selectedBlocks) {
      const parsed = parseStructuredBlock(block);
      if (!parsed.ok) continue;
      if (!action.ok) {
        findings.push({
          rule: "DOC_ACTION_UNAVAILABLE",
          severity: "error",
          message: action.message,
          document: block.location,
          evidence: { path: actionExample.action },
        });
        continue;
      }
      for (const key of workflowWithKeys(parsed.value)) {
        if (!action.inputs.has(key)) {
          findings.push({
            rule: "DOC_ACTION_INPUT_UNKNOWN",
            severity: "error",
            message: `Documented Action input "${key}" does not exist in ${actionExample.action}.`,
            document: block.location,
            evidence: { path: actionExample.action, pointer: `/inputs/${key}` },
            suggestion: "Use an input declared by the Action metadata.",
          });
        }
      }
    }
  }
  return findings;
}

type ActionResult = { ok: true; inputs: ReadonlySet<string> } | { ok: false; message: string };

async function loadAction(
  reader: RepositoryReader,
  actionPath: string,
  cache: Map<string, ActionResult>,
): Promise<ActionResult> {
  const cached = cache.get(actionPath);
  if (cached) return cached;
  let result: ActionResult;
  try {
    result = { ok: true, inputs: await readActionInputs(reader, actionPath) };
  } catch (error: unknown) {
    result = { ok: false, message: `Cannot load Action ${actionPath}: ${messageOf(error)}` };
  }
  cache.set(actionPath, result);
  return result;
}

function isYaml(block: DocumentFact["codeBlocks"][number]): boolean {
  return block.language === "yaml" || block.language === "yml";
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
