import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { RepositoryPathError } from "../../src/core/errors.js";
import { verifyRepository } from "../../src/core/verify.js";
import { NodeRepositoryReader } from "../../src/repository/node-reader.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("NodeRepositoryReader", () => {
  it("does not follow file symlinks that resolve outside the repository", async () => {
    const root = await temporaryDirectory("docsentry-repository-");
    const outside = await temporaryDirectory("docsentry-outside-");
    await mkdir(path.join(root, "docs"));
    await writeFile(path.join(outside, "outside.md"), "# Outside\n", "utf8");
    await symlink(path.join(outside, "outside.md"), path.join(root, "docs", "outside.md"));

    const reader = new NodeRepositoryReader(root);

    await expect(reader.exists("docs/outside.md")).rejects.toBeInstanceOf(RepositoryPathError);
    await expect(reader.readText("docs/outside.md")).rejects.toBeInstanceOf(RepositoryPathError);
    await expect(reader.listFiles()).resolves.not.toContain("docs/outside.md");
  });

  it("reports a link to an external symlink as outside the repository", async () => {
    const root = await temporaryDirectory("docsentry-repository-");
    const outside = await temporaryDirectory("docsentry-outside-");
    await mkdir(path.join(root, "docs"));
    await writeFile(path.join(outside, "outside.md"), "# Outside\n", "utf8");
    await symlink(path.join(outside, "outside.md"), path.join(root, "docs", "outside.md"));
    await writeFile(path.join(root, "README.md"), "[Outside](docs/outside.md#outside)\n", "utf8");

    await expect(verifyRepository({ root })).resolves.toMatchObject({
      findings: [{ rule: "DOC_LINK_OUTSIDE_REPOSITORY", document: { path: "README.md", line: 1 } }],
      summary: { errors: 1, warnings: 0 },
    });
  });
});

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}
