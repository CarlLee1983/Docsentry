import type { ContractProposal } from "../proposal.js";
import type { DocumentFact } from "../../documents/markdown.js";

/**
 * Propose validating fenced JSON examples against a JSON Schema the repository
 * already ships.
 *
 * The schema is identified by filename convention, and every fenced JSON
 * example in a selected document is validated. That is the widest reading of
 * the evidence: a document may well contain JSON that the schema does not
 * govern, which the reported adoption cost makes visible before the contract
 * is committed. A `fenceLabel` narrows it afterwards.
 */
export function proposeSchemaExamples(
  documents: readonly DocumentFact[],
  files: readonly string[],
): ContractProposal[] {
  // `schema.json` is preferred by name: a repository that ships several
  // schemas usually means that one to describe its own configuration, which is
  // what a document's examples are most likely to be.
  const schemas = files
    .filter((filePath) => !filePath.includes("/"))
    .filter((filePath) => filePath === "schema.json" || filePath.endsWith(".schema.json"))
    .sort((left, right) => left.localeCompare(right));
  const schema = schemas.find((filePath) => filePath === "schema.json") ?? schemas[0];
  if (!schema) return [];

  const paths = documents
    .filter((document) => document.codeBlocks.some((block) => block.language === "json"))
    .map((document) => document.path);
  if (paths.length === 0) return [];

  return [
    {
      section: "schemaExamples",
      label: `fenced JSON examples against ${schema}`,
      justification: `${paths[0]} contains a fenced JSON example and this repository ships ${schema}.`,
      caveat: `Every fenced JSON example in the selected documents is validated. Narrow it with a fenceLabel, or by removing documents whose JSON the schema does not govern.`,
      fragment: { schemaExamples: [{ documents: paths, language: "json", schema }] },
    },
  ];
}
