import type { DocsentryConfig } from "./config.js";

/** The configuration section a proposed contract would be added to. */
export type ProposalSection =
  | "package"
  | "schemaExamples"
  | "actionExamples"
  | "documentPairs"
  | "versionReferences"
  | "pathReferences";

/**
 * A contract Docsentry offers to a maintainer, together with the artifact that
 * supports offering it.
 *
 * A proposal is a draft addressed to a person. It is never evidence and never
 * a Finding: nothing is checked until a maintainer commits the fragment to a
 * configuration file.
 */
export type ContractProposal = {
  section: ProposalSection;
  /** What the contract would keep in step, in a maintainer's words. */
  label: string;
  /** The artifact that supports the proposal, named so it can be checked. */
  justification: string;
  /**
   * How to narrow the contract when its reading of the evidence is wider than
   * the maintainer intends. Present only where the generalisation is real.
   */
  caveat?: string;
  /** The configuration this contract would add. */
  fragment: DocsentryConfig;
};

/** Combine proposed fragments into one configuration, preserving order. */
export function mergeFragments(
  base: DocsentryConfig,
  fragments: readonly DocsentryConfig[],
): DocsentryConfig {
  return fragments.reduce<DocsentryConfig>((merged, fragment) => {
    const assertions = [...(merged.package?.assertions ?? []), ...(fragment.package?.assertions ?? [])];
    const manifest = fragment.package?.manifest ?? merged.package?.manifest;
    return {
      ...merged,
      ...(assertions.length > 0 || manifest
        ? { package: { ...(manifest ? { manifest } : {}), ...(assertions.length > 0 ? { assertions } : {}) } }
        : {}),
      schemaExamples: concat(merged.schemaExamples, fragment.schemaExamples),
      actionExamples: concat(merged.actionExamples, fragment.actionExamples),
      documentPairs: concat(merged.documentPairs, fragment.documentPairs),
      versionReferences: concat(merged.versionReferences, fragment.versionReferences),
      pathReferences: concat(merged.pathReferences, fragment.pathReferences),
      enumerations: concat(merged.enumerations, fragment.enumerations),
      directoryTrees: concat(merged.directoryTrees, fragment.directoryTrees),
    };
  }, base);
}

function concat<T>(left: readonly T[] | undefined, right: readonly T[] | undefined): readonly T[] | undefined {
  if (!left && !right) return undefined;
  return [...(left ?? []), ...(right ?? [])];
}
