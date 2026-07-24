import { describe, expect, it } from "vitest";

import { suggestContracts } from "../../src/core/suggest.js";
import { MemoryRepositoryReader } from "../../src/repository/memory-reader.js";

const workflowExample = [
  "```yaml",
  "jobs:",
  "  verify:",
  "    steps:",
  "      - uses: actions/checkout@v4",
  "      - uses: CarlLee1983/Widget@v1.2.0",
  "```",
].join("\n");

describe("suggestContracts", () => {
  it("proposes the contracts a checkout supports and costs each one", async () => {
    const reader = new MemoryRepositoryReader({
      "package.json": JSON.stringify({ name: "@carllee1983/widget", version: "1.2.0" }),
      "action.yml": "name: Widget\ninputs:\n  config:\n    description: Path\n",
      "README.md": [
        "# Widget",
        "",
        "Install `@carllee1983/widget` and read `src/index.ts`.",
        "",
        workflowExample,
        "",
      ].join("\n"),
      "src/index.ts": "export const widget = 1;\n",
    });

    const suggestion = await suggestContracts(reader);

    expect(suggestion.proposals.map((proposal) => proposal.section)).toEqual([
      "package",
      "actionExamples",
      "versionReferences",
      "pathReferences",
    ]);
    for (const proposal of suggestion.proposals) {
      expect(proposal.cost).toEqual({ errors: 0, warnings: 0 });
    }
  });

  it("reports the findings a proposal would produce against the current checkout", async () => {
    const reader = new MemoryRepositoryReader({
      "package.json": JSON.stringify({ name: "@carllee1983/widget", version: "1.2.0" }),
      "README.md": "# Widget\n\nInstall `@carllee1983/widget`, see `src/index.ts` and `src/gone.ts`.\n",
      "src/index.ts": "export const widget = 1;\n",
    });

    const suggestion = await suggestContracts(reader);
    const pathReference = suggestion.proposals.find((proposal) => proposal.section === "pathReferences");

    expect(pathReference?.cost).toEqual({ errors: 1, warnings: 0 });
  });

  it("selects the repository's Markdown documents", async () => {
    const reader = new MemoryRepositoryReader({
      "README.md": "# Widget\n",
      "SPEC.md": "# Spec\n",
      "docs/guide.md": "# Guide\n",
      "docs/nested/reference.md": "# Reference\n",
      "src/index.ts": "export const widget = 1;\n",
    });

    const suggestion = await suggestContracts(reader);

    expect(suggestion.documents).toEqual(["README.md", "SPEC.md", "docs/**/*.md"]);
  });

  it("omits a contract an existing configuration already declares", async () => {
    const reader = new MemoryRepositoryReader({
      ".docsentry.json": JSON.stringify({
        documents: ["README.md"],
        versionReferences: [{ documents: ["README.md"], pattern: "CarlLee1983/Widget@v{version}" }],
      }),
      "package.json": JSON.stringify({ name: "@carllee1983/widget", version: "1.2.0" }),
      "action.yml": "name: Widget\ninputs: {}\n",
      "README.md": `# Widget\n\n${workflowExample}\n`,
    });

    const suggestion = await suggestContracts(reader);

    expect(suggestion.proposals.map((proposal) => proposal.section)).toEqual(["actionExamples"]);
  });

  it("does not propose a manifest value another document already asserts", async () => {
    const reader = new MemoryRepositoryReader({
      ".docsentry.json": JSON.stringify({
        documents: ["README.md", "GUIDE.md"],
        package: {
          manifest: "package.json",
          assertions: [
            { document: "README.md", label: "published package name", value: "@scope/widget", evidence: "/name" },
          ],
        },
      }),
      "package.json": JSON.stringify({ name: "@scope/widget", version: "1.2.0" }),
      "README.md": "# Widget\n",
      "GUIDE.md": "Install `@scope/widget`.\n",
    });

    const suggestion = await suggestContracts(reader);

    expect(suggestion.proposals).toEqual([]);
  });

  it("proposes nothing for a repository with no evidence to support a contract", async () => {
    const reader = new MemoryRepositoryReader({ "README.md": "# Widget\n\nProse only.\n" });

    const suggestion = await suggestContracts(reader);

    expect(suggestion.proposals).toEqual([]);
    expect(suggestion.documents).toEqual(["README.md"]);
  });
});
