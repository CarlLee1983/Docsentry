import { readFile } from "node:fs/promises";

import { Ajv } from "ajv";
import YAML from "yaml";
import { describe, expect, it } from "vitest";

describe("delivery artifacts", () => {
  it("validates the documented Tagsmith configuration with the packaged schema", async () => {
    const schema = JSON.parse(await readFile(new URL("../schema.json", import.meta.url), "utf8"));
    const example = JSON.parse(
      await readFile(new URL("../examples/tagsmith.docsentry.json", import.meta.url), "utf8"),
    );
    const validate = new Ajv({ strict: false }).compile(schema);

    expect(validate(example)).toBe(true);
    expect(
      validate({
        schemaExamples: [
          {
            documents: ["README.md"],
            language: "json",
            schema: "schema.json",
            fenceLabel: "docsentry-config",
          },
        ],
      }),
    ).toBe(true);
    expect(
      validate({
        schemaExamples: [
          {
            documents: ["README.md"],
            language: "json",
            schema: "schema.json",
            fenceLabel: "two labels",
          },
        ],
      }),
    ).toBe(false);
    expect(validate({ documents: ["README.md"], unexpected: true })).toBe(false);
  });

  it("declares a composite Action that works with and without a configuration", async () => {
    const action = YAML.parse(await readFile(new URL("../action.yml", import.meta.url), "utf8")) as {
      inputs: { config: { default: string }; format: { description: string } };
      runs: { using: string; steps: Array<{ run?: string }> };
    };

    expect(action.inputs.config.default).toBe("");
    expect(action.inputs.format.description).toContain("sarif");
    expect(action.runs.using).toBe("composite");
    expect(action.runs.steps.some((step) => step.run?.includes('if [[ -n "$DOCSENTRY_CONFIG" ]]'))).toBe(true);
  });

  it("publishes verified version tags as idempotent GitHub Releases", async () => {
    const release = YAML.parse(
      await readFile(new URL("../.github/workflows/release.yml", import.meta.url), "utf8"),
    ) as {
      on: {
        push: { tags: string[] };
        workflow_dispatch: { inputs: { tag: { required: boolean } } };
      };
      jobs: {
        release: {
          permissions: { contents: string };
          steps: Array<{ run?: string }>;
        };
      };
    };
    const tagsmith = JSON.parse(
      await readFile(new URL("../.tagsmith.json", import.meta.url), "utf8"),
    ) as { tags: Array<{ push: boolean }> };

    expect(release.on.push.tags).toEqual(["v*"]);
    expect(release.on.workflow_dispatch.inputs.tag.required).toBe(true);
    expect(release.jobs.release.permissions.contents).toBe("write");
    expect(release.jobs.release.steps.some((step) => step.run?.includes("npm run release:verify"))).toBe(true);
    expect(release.jobs.release.steps.some((step) => step.run?.includes("gh release view"))).toBe(true);
    expect(release.jobs.release.steps.some((step) => step.run?.includes("gh release create"))).toBe(true);
    expect(tagsmith.tags[0]?.push).toBe(true);
  });
});
