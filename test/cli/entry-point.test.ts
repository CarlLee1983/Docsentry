import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { isEntryPoint } from "../../src/cli/entry-point.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(): Promise<{ target: string; link: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "docsentry-entry-"));
  roots.push(root);
  const target = path.join(root, "index.js");
  const link = path.join(root, "docsentry");
  await writeFile(target, "");
  await symlink(target, link);
  return { target, link };
}

describe("isEntryPoint", () => {
  it("recognizes a direct invocation of the module", async () => {
    const { target } = await fixture();
    expect(isEntryPoint(target, pathToFileURL(target).href)).toBe(true);
  });

  it("recognizes an invocation through an npm bin symlink", async () => {
    const { target, link } = await fixture();
    expect(isEntryPoint(link, pathToFileURL(target).href)).toBe(true);
  });

  it("rejects an import from another script", async () => {
    const { target } = await fixture();
    expect(isEntryPoint(path.join(path.dirname(target), "other.js"), pathToFileURL(target).href)).toBe(false);
  });

  it("rejects a missing script path", async () => {
    const { target } = await fixture();
    expect(isEntryPoint(undefined, pathToFileURL(target).href)).toBe(false);
  });
});
