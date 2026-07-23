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
    expect(validate({ documents: ["README.md"], unexpected: true })).toBe(false);
  });

  it("declares a composite Action that works with and without a configuration", async () => {
    const action = YAML.parse(await readFile(new URL("../action.yml", import.meta.url), "utf8")) as {
      inputs: { config: { default: string } };
      runs: { using: string; steps: Array<{ run?: string }> };
    };

    expect(action.inputs.config.default).toBe("");
    expect(action.runs.using).toBe("composite");
    expect(action.runs.steps.some((step) => step.run?.includes('if [[ -n "$DOCSENTRY_CONFIG" ]]'))).toBe(true);
  });
});
