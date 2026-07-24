import { mergeFragments } from "../core/proposal.js";
import { suggestContracts, type ContractSuggestion, type CostedProposal } from "../core/suggest.js";
import type { DocsentryConfig } from "../core/config.js";
import { NodeRepositoryReader } from "../repository/node-reader.js";

const SCHEMA_POINTER = "./node_modules/@carllee1983/docsentry/schema.json";

/** Draft the contracts a checkout supports, for a maintainer to review. */
export async function suggest(root: string, configPath?: string): Promise<string> {
  const suggestion = await suggestContracts(new NodeRepositoryReader(root), { configPath });
  return render(suggestion);
}

/** The configuration a maintainer would commit to adopt every proposal. */
export async function suggestedConfig(root: string): Promise<DocsentryConfig & { $schema: string }> {
  const suggestion = await suggestContracts(new NodeRepositoryReader(root));
  return {
    $schema: SCHEMA_POINTER,
    ...mergeFragments(
      { documents: suggestion.documents },
      suggestion.proposals.map((proposal) => proposal.fragment),
    ),
  };
}

function render(suggestion: ContractSuggestion): string {
  if (suggestion.proposals.length === 0) {
    return [
      "No contract is proposed.",
      "",
      suggestion.existing
        ? "Every contract this checkout supports is already declared."
        : "No artifact in this checkout supports a contract that can be justified by an exact match.",
      "",
    ].join("\n");
  }

  const lines = [
    `${suggestion.proposals.length} contract(s) proposed. Each one is a draft; nothing is checked until you commit it.`,
    "",
  ];

  suggestion.proposals.forEach((proposal, index) => {
    lines.push(`${index + 1}. ${proposal.label}  [${proposal.section}]`);
    lines.push(`   ${proposal.justification}`);
    lines.push(`   Adopting it ${describeCost(proposal)}.`);
    if (proposal.caveat) lines.push(`   Note: ${proposal.caveat}`);
    lines.push("");
  });

  lines.push(suggestion.existing ? "Add to .docsentry.json:" : "Proposed .docsentry.json:");
  lines.push("");
  lines.push(JSON.stringify(configurationFor(suggestion), null, 2));
  lines.push("");
  lines.push("Nothing was written. Copy what you want to keep into your configuration.");
  lines.push("");
  return lines.join("\n");
}

function configurationFor(suggestion: ContractSuggestion): DocsentryConfig & { $schema?: string } {
  const fragments = suggestion.proposals.map((proposal) => proposal.fragment);
  if (suggestion.existing) return mergeFragments({}, fragments);
  return { $schema: SCHEMA_POINTER, ...mergeFragments({ documents: suggestion.documents }, fragments) };
}

function describeCost(proposal: CostedProposal): string {
  const { errors, warnings } = proposal.cost;
  if (errors === 0 && warnings === 0) return "reports nothing against the current checkout";
  const counts = [
    ...(errors > 0 ? [`${errors} error(s)`] : []),
    ...(warnings > 0 ? [`${warnings} warning(s)`] : []),
  ];
  return `reports ${counts.join(" and ")} against the current checkout`;
}
