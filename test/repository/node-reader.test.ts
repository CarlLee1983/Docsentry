import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { RepositoryPathError } from "../../src/core/errors.js";
import { verifyRepository } from "../../src/core/verify.js";
import { NodeRepositoryReader } from "../../src/repository/node-reader.js";

const temporaryDirectories: string[] = [];
const execFileAsync = promisify(execFile);

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

  it("does not discover a document a root .gitignore ignores", async () => {
    const root = await temporaryDirectory("docsentry-repository-");
    await writeFile(path.join(root, ".gitignore"), ".venv/\n", "utf8");
    await mkdir(path.join(root, ".venv"));
    await writeFile(path.join(root, ".venv", "vendor.md"), "# Vendor\n", "utf8");
    await writeFile(path.join(root, "README.md"), "# Readme\n", "utf8");

    const reader = new NodeRepositoryReader(root);

    await expect(reader.listFiles()).resolves.toEqual([".gitignore", "README.md"]);
  });

  it("applies a nested .gitignore only below the directory that carries it", async () => {
    const root = await temporaryDirectory("docsentry-repository-");
    await mkdir(path.join(root, "docs"));
    await writeFile(path.join(root, "docs", ".gitignore"), "draft.md\n", "utf8");
    await writeFile(path.join(root, "docs", "draft.md"), "# Draft\n", "utf8");
    await writeFile(path.join(root, "docs", "guide.md"), "# Guide\n", "utf8");
    await writeFile(path.join(root, "draft.md"), "# Root draft\n", "utf8");

    const reader = new NodeRepositoryReader(root);

    await expect(reader.listFiles()).resolves.toEqual(["docs/.gitignore", "docs/guide.md", "draft.md"]);
  });

  // Expected values verified against `git ls-files --others --exclude-standard`
  // in an equivalent checkout.
  it("lets a nested .gitignore re-include a file its parent ignored", async () => {
    const root = await temporaryDirectory("docsentry-repository-");
    await writeFile(path.join(root, ".gitignore"), "*.md\n", "utf8");
    await mkdir(path.join(root, "docs"));
    await writeFile(path.join(root, "docs", ".gitignore"), "!guide.md\n", "utf8");
    await writeFile(path.join(root, "docs", "guide.md"), "# Guide\n", "utf8");
    await writeFile(path.join(root, "README.md"), "# Readme\n", "utf8");

    const reader = new NodeRepositoryReader(root);

    await expect(reader.listFiles()).resolves.toEqual([".gitignore", "docs/.gitignore", "docs/guide.md"]);
  });

  // The ignore boundary scopes discovery, not evidence: a contract names its
  // evidence explicitly, and that declaration outranks the walk's heuristics.
  it("still reads an ignored file that a contract names as evidence", async () => {
    const root = await temporaryDirectory("docsentry-repository-");
    await writeFile(path.join(root, ".gitignore"), "out/\n", "utf8");
    await mkdir(path.join(root, "out"));
    await writeFile(path.join(root, "out", "schema.json"), "{}\n", "utf8");

    const reader = new NodeRepositoryReader(root);

    await expect(reader.listFiles()).resolves.not.toContain("out/schema.json");
    await expect(reader.exists("out/schema.json")).resolves.toBe(true);
    await expect(reader.readText("out/schema.json")).resolves.toBe("{}\n");
  });

  it("keeps a directory a nested .gitignore re-included open to its own contents", async () => {
    const root = await temporaryDirectory("docsentry-repository-");
    await writeFile(path.join(root, ".gitignore"), "dist/\n", "utf8");
    await mkdir(path.join(root, "packages", "app", "dist"), { recursive: true });
    await writeFile(path.join(root, "packages", "app", ".gitignore"), "!dist/\n", "utf8");
    await writeFile(path.join(root, "packages", "app", "dist", "README.md"), "# Built\n", "utf8");
    await writeFile(path.join(root, "packages", "app", "main.md"), "# Main\n", "utf8");

    const reader = new NodeRepositoryReader(root);

    await expect(reader.listFiles()).resolves.toEqual([
      ".gitignore",
      "packages/app/.gitignore",
      "packages/app/dist/README.md",
      "packages/app/main.md",
    ]);
  });

  // The hard-coded `node_modules` exclusion was deliberately dropped: a checkout
  // that declares no boundary is walked in full, exactly as Git reports it.
  it("discovers node_modules when the checkout declares no ignore rules", async () => {
    const root = await temporaryDirectory("docsentry-repository-");
    await mkdir(path.join(root, "node_modules", "pkg"), { recursive: true });
    await writeFile(path.join(root, "node_modules", "pkg", "doc.md"), "# Vendored\n", "utf8");
    await writeFile(path.join(root, "README.md"), "# Readme\n", "utf8");

    const reader = new NodeRepositoryReader(root);

    await expect(reader.listFiles()).resolves.toEqual(["node_modules/pkg/doc.md", "README.md"]);
  });

  it("never discovers anything inside a .git directory", async () => {
    const root = await temporaryDirectory("docsentry-repository-");
    await mkdir(path.join(root, ".git", "hooks"), { recursive: true });
    await writeFile(path.join(root, ".git", "hooks", "notes.md"), "# Internal\n", "utf8");
    await writeFile(path.join(root, "README.md"), "# Readme\n", "utf8");

    const reader = new NodeRepositoryReader(root);

    await expect(reader.listFiles()).resolves.toEqual(["README.md"]);
  });

  it("applies .git/info/exclude, which a checkout holds but does not commit", async () => {
    const root = await temporaryDirectory("docsentry-repository-");
    await mkdir(path.join(root, ".git", "info"), { recursive: true });
    await writeFile(path.join(root, ".git", "info", "exclude"), "out/\n", "utf8");
    await mkdir(path.join(root, "out"));
    await writeFile(path.join(root, "out", "generated.md"), "# Generated\n", "utf8");
    await writeFile(path.join(root, "keep.md"), "# Keep\n", "utf8");

    const reader = new NodeRepositoryReader(root);

    await expect(reader.listFiles()).resolves.toEqual(["keep.md"]);
  });

  // Git opens an ignore file with O_NOFOLLOW. Honouring a symlinked one would
  // let a committed file apply rules read from outside the checkout.
  it("ignores a .gitignore symlinked to a file outside the repository", async () => {
    const root = await temporaryDirectory("docsentry-repository-");
    const outside = await temporaryDirectory("docsentry-outside-");
    await writeFile(path.join(outside, "rules.txt"), "a.md\n", "utf8");
    await symlink(path.join(outside, "rules.txt"), path.join(root, ".gitignore"));
    await writeFile(path.join(root, "a.md"), "# A\n", "utf8");

    const reader = new NodeRepositoryReader(root);

    await expect(reader.listFiles()).resolves.toEqual(["a.md"]);
  });

  // Records an accepted divergence rather than a desired behaviour: Git treats a
  // vendored checkout as an opaque boundary, and this walk does not, because
  // recognising one means reimplementing Git's own repository test. A repository
  // that ignores its vendored checkouts is unaffected. See ADR 0008.
  it("walks into a vendored checkout, which Git would treat as opaque", async () => {
    const root = await temporaryDirectory("docsentry-repository-");
    await mkdir(path.join(root, "vendor", "lib"), { recursive: true });
    await execFileAsync("git", ["init", "--quiet"], { cwd: path.join(root, "vendor", "lib") });
    await writeFile(path.join(root, "vendor", "lib", "README.md"), "# Vendored\n", "utf8");
    await writeFile(path.join(root, "top.md"), "# Top\n", "utf8");

    const reader = new NodeRepositoryReader(root);

    await expect(reader.listFiles()).resolves.toEqual(["top.md", "vendor/lib/README.md"]);
  });

  // Expected values verified against `git ls-files --others --exclude-standard`.
  it("keeps the rest of an ignore file applying inside a re-included directory", async () => {
    const root = await temporaryDirectory("docsentry-repository-");
    await writeFile(path.join(root, ".gitignore"), "*.log\nbuild/\n", "utf8");
    await mkdir(path.join(root, "docs", "build"), { recursive: true });
    await writeFile(path.join(root, "docs", ".gitignore"), "!build/\n", "utf8");
    await writeFile(path.join(root, "docs", "build", "a.md"), "# A\n", "utf8");
    await writeFile(path.join(root, "docs", "build", "x.log"), "noise\n", "utf8");
    await writeFile(path.join(root, "keep.md"), "# Keep\n", "utf8");

    const reader = new NodeRepositoryReader(root);

    await expect(reader.listFiles()).resolves.toEqual([
      ".gitignore",
      "docs/.gitignore",
      "docs/build/a.md",
      "keep.md",
    ]);
  });

  it("keeps a catch-all pattern applying inside a directory it re-included", async () => {
    const root = await temporaryDirectory("docsentry-repository-");
    await writeFile(path.join(root, ".gitignore"), "*\n!docs/\n", "utf8");
    await mkdir(path.join(root, "docs"));
    await writeFile(path.join(root, "docs", "a.md"), "# A\n", "utf8");
    await writeFile(path.join(root, "top.md"), "# Top\n", "utf8");

    const reader = new NodeRepositoryReader(root);

    await expect(reader.listFiles()).resolves.toEqual([]);
  });

  // A name pattern matches a name, so re-including a directory it excluded does
  // not carry the exclusion down onto contents whose names it never matched.
  it("stops a name pattern at the directory it named", async () => {
    const root = await temporaryDirectory("docsentry-repository-");
    await writeFile(path.join(root, ".gitignore"), "__*\n", "utf8");
    await mkdir(path.join(root, "pkg", "__pycache__", "inner"), { recursive: true });
    await writeFile(path.join(root, "pkg", ".gitignore"), "!__pycache__/\n", "utf8");
    await writeFile(path.join(root, "pkg", "__pycache__", "f.md"), "# F\n", "utf8");
    await writeFile(path.join(root, "pkg", "__pycache__", "inner", "g.md"), "# G\n", "utf8");
    await writeFile(path.join(root, "top.md"), "# Top\n", "utf8");

    const reader = new NodeRepositoryReader(root);

    await expect(reader.listFiles()).resolves.toEqual([
      ".gitignore",
      "pkg/__pycache__/f.md",
      "pkg/__pycache__/inner/g.md",
      "pkg/.gitignore",
      "top.md",
    ]);
  });

  // An anchored negation re-includes one directory, not every directory of that
  // name below it.
  it("keeps an anchored negation from re-including a deeper directory of the same name", async () => {
    const root = await temporaryDirectory("docsentry-repository-");
    await writeFile(path.join(root, ".gitignore"), "build/\n", "utf8");
    await mkdir(path.join(root, "x", "build", "build"), { recursive: true });
    await writeFile(path.join(root, "x", ".gitignore"), "!/build/\n", "utf8");
    await writeFile(path.join(root, "x", "build", "a.md"), "# A\n", "utf8");
    await writeFile(path.join(root, "x", "build", "build", "b.md"), "# B\n", "utf8");

    const reader = new NodeRepositoryReader(root);

    await expect(reader.listFiles()).resolves.toEqual([".gitignore", "x/.gitignore", "x/build/a.md"]);
  });

  // A carriage return left by a CRLF checkout would otherwise turn `docs/` into
  // neither a directory pattern nor a name.
  it("reads an ignore file written with CRLF line endings", async () => {
    const root = await temporaryDirectory("docsentry-repository-");
    await writeFile(path.join(root, ".gitignore"), "docs/\r\n", "utf8");
    await mkdir(path.join(root, "a", "b", "docs", "deep"), { recursive: true });
    await writeFile(path.join(root, "a", "b", "docs", "deep", "f.md"), "# F\n", "utf8");
    await writeFile(path.join(root, "keep.md"), "# Keep\n", "utf8");

    const reader = new NodeRepositoryReader(root);

    await expect(reader.listFiles()).resolves.toEqual([".gitignore", "keep.md"]);
  });

  it("scopes a globstar pattern to the directory it matches, not its descendants", async () => {
    const root = await temporaryDirectory("docsentry-repository-");
    await writeFile(path.join(root, ".gitignore"), "**/build/\n", "utf8");
    await mkdir(path.join(root, "x", "build", "c"), { recursive: true });
    await writeFile(path.join(root, "x", ".gitignore"), "!build/\n", "utf8");
    await writeFile(path.join(root, "x", "build", "keep.md"), "# Keep\n", "utf8");
    await writeFile(path.join(root, "x", "build", "c", "f.md"), "# F\n", "utf8");

    const reader = new NodeRepositoryReader(root);

    await expect(reader.listFiles()).resolves.toEqual([
      ".gitignore",
      "x/.gitignore",
      "x/build/c/f.md",
      "x/build/keep.md",
    ]);
  });

  // Braces and extended globs are ordinary filename characters to Git. Expanding
  // them would both miss the file a pattern names and drop files it does not.
  it("treats brace and extended-glob syntax as literal filename characters", async () => {
    const root = await temporaryDirectory("docsentry-repository-");
    await writeFile(path.join(root, ".gitignore"), "{a,b}.md\n+(c).md\n", "utf8");
    await writeFile(path.join(root, "{a,b}.md"), "# Literal\n", "utf8");
    await writeFile(path.join(root, "+(c).md"), "# Literal\n", "utf8");
    await writeFile(path.join(root, "a.md"), "# A\n", "utf8");
    await writeFile(path.join(root, "c.md"), "# C\n", "utf8");

    const reader = new NodeRepositoryReader(root);

    await expect(reader.listFiles()).resolves.toEqual([".gitignore", "a.md", "c.md"]);
  });

  // Git strips a trailing space but not a trailing tab, which leaves a pattern
  // that matches nothing.
  it("keeps a pattern ending in a tab inert", async () => {
    const root = await temporaryDirectory("docsentry-repository-");
    await writeFile(path.join(root, ".gitignore"), "build/\t\n", "utf8");
    await mkdir(path.join(root, "build"));
    await writeFile(path.join(root, "build", "f.md"), "# F\n", "utf8");
    await writeFile(path.join(root, "keep.md"), "# Keep\n", "utf8");

    const reader = new NodeRepositoryReader(root);

    await expect(reader.listFiles()).resolves.toEqual([".gitignore", "build/f.md", "keep.md"]);
  });

  it("skips a byte-order mark rather than binding it to the first pattern", async () => {
    const root = await temporaryDirectory("docsentry-repository-");
    await writeFile(path.join(root, ".gitignore"), "﻿out/\n", "utf8");
    await mkdir(path.join(root, "out"));
    await writeFile(path.join(root, "out", "a.md"), "# A\n", "utf8");
    await writeFile(path.join(root, "keep.md"), "# Keep\n", "utf8");

    const reader = new NodeRepositoryReader(root);

    await expect(reader.listFiles()).resolves.toEqual([".gitignore", "keep.md"]);
  });

  it("keeps the documented differential fixture count explicit", () => {
    expect(differentialFixtures).toHaveLength(53);
    expect(differentialFixtures.filter((fixture) => fixture.acceptedDivergence)).toHaveLength(1);
  });

  it.each(differentialFixtures)("matches Git's checkout boundary for $name", async (fixture) => {
    const root = await temporaryDirectory("docsentry-gitignore-");
    await execFileAsync("git", ["init", "--quiet"], { cwd: root });
    for (const [relativePath, contents] of Object.entries(fixture.files)) {
      await mkdir(path.dirname(path.join(root, relativePath)), { recursive: true });
      await writeFile(path.join(root, relativePath), contents, "utf8");
    }
    if (fixture.nestedRepository) {
      await execFileAsync("git", ["init", "--quiet"], { cwd: path.join(root, fixture.nestedRepository) });
    }

    const readerFiles = await new NodeRepositoryReader(root).listFiles();
    const { stdout } = await execFileAsync("git", ["ls-files", "--others", "--exclude-standard"], {
      cwd: root,
      encoding: "utf8",
    });
    const gitFiles = stdout
      .split("\n")
      .filter((file) => file !== "")
      .sort((left, right) => left.localeCompare(right));

    if (fixture.acceptedDivergence) {
      expect(readerFiles).not.toEqual(gitFiles);
      expect(readerFiles).toContain("vendor/lib/README.md");
    } else {
      expect(readerFiles).toEqual(gitFiles);
    }
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

interface DifferentialFixture {
  readonly name: string;
  readonly files: Readonly<Record<string, string>>;
  readonly acceptedDivergence?: boolean;
  readonly nestedRepository?: string;
}

type RootPatternFixture = readonly [
  name: string,
  pattern: string,
  paths: readonly string[],
];

const rootPatternFixtures: readonly RootPatternFixture[] = [
  ["an empty ignore file", "", ["README.md", "src/index.ts"]],
  ["a literal file", "draft.md\n", ["draft.md", "keep.md"]],
  ["a literal directory", "build/\n", ["build/out.md", "keep.md"]],
  ["an unanchored directory", "build/\n", ["a/build/out.md", "keep.md"]],
  ["an anchored directory", "/build/\n", ["build/out.md", "a/build/keep.md"]],
  ["an extension wildcard", "*.log\n", ["a.log", "nested/b.log", "keep.md"]],
  ["a wildcard over hidden names", "*.cache\n", [".cache", "nested/.cache", "keep.md"]],
  ["a question-mark wildcard", "draft?.md\n", ["draft1.md", "draft12.md", "keep.md"]],
  ["a character class", "file[0-2].md\n", ["file0.md", "file3.md", "keep.md"]],
  ["a negated character class", "file[!0].md\n", ["file0.md", "file1.md", "keep.md"]],
  ["a globstar extension", "**/*.log\n", ["a.log", "one/two/b.log", "keep.md"]],
  ["a path globstar", "docs/**/draft.md\n", ["docs/draft.md", "docs/a/draft.md", "draft.md"]],
  ["a middle globstar", "a/**/b.md\n", ["a/b.md", "a/x/y/b.md", "b.md"]],
  ["a relative path pattern", "docs/draft.md\n", ["docs/draft.md", "a/docs/draft.md"]],
  ["an anchored file", "/root.md\n", ["root.md", "nested/root.md"]],
  ["a directory-only name", "cache/\n", ["cache", "nested/cache/out.md", "keep.md"]],
  ["a name matching files and directories", "temp\n", ["temp", "nested/temp/out.md", "keep.md"]],
  ["a comment", "# draft.md\n", ["draft.md", "keep.md"]],
  ["an escaped leading hash", "\\#draft.md\n", ["#draft.md", "draft.md"]],
  ["an escaped leading negation", "\\!important.md\n", ["!important.md", "important.md"]],
  ["a lone negation", "!\n", ["draft.md", "keep.md"]],
  ["a slash-only pattern", "/\n", ["draft.md", "nested/keep.md"]],
  ["trailing spaces", "draft.md   \n", ["draft.md", "keep.md"]],
  ["an escaped trailing space", "draft\\ \n", ["draft ", "draft"]],
  ["a trailing tab", "build/\t\n", ["build/out.md", "keep.md"]],
  ["CRLF lines", "build/\r\n", ["build/out.md", "keep.md"]],
  ["a byte-order mark", "\uFEFFbuild/\n", ["build/out.md", "keep.md"]],
  ["literal brace syntax", "{a,b}.md\n", ["{a,b}.md", "a.md", "b.md"]],
  ["literal extended-glob syntax", "+(a).md\n", ["+(a).md", "a.md"]],
  ["a globstar directory", "**/build/\n", ["build/out.md", "a/build/out.md", "keep.md"]],
  ["an anchored wildcard", "/*.tmp\n", ["a.tmp", "nested/b.tmp"]],
  ["a leading globstar", "**/draft.md\n", ["draft.md", "a/b/draft.md", "keep.md"]],
  ["a trailing globstar", "docs/**\n", ["docs/a.md", "docs/a/b.md", "keep.md"]],
  ["zero directories in a globstar", "a/**/b\n", ["a/b", "a/x/b", "b"]],
  ["a dot directory", ".cache/\n", [".cache/a.md", "nested/.cache/b.md", "keep.md"]],
  ["case-sensitive names", "Build/\n", ["Build/a.md", "build/b.md"]],
  ["a final negation", "*.md\n!keep.md\n", ["draft.md", "keep.md"]],
  ["a final exclusion", "*.md\n!keep.md\nkeep.md\n", ["draft.md", "keep.md"]],
];

const differentialFixtures: readonly DifferentialFixture[] = [
  ...rootPatternFixtures.map(([name, pattern, paths]) => rootPatternFixture(name, pattern, paths)),
  fixture("a nested ignore file", {
    "docs/.gitignore": "draft.md\n",
    "docs/draft.md": "fixture\n",
    "docs/keep.md": "fixture\n",
  }),
  fixture("a nested rule that does not leak", {
    "docs/.gitignore": "draft.md\n",
    "docs/draft.md": "fixture\n",
    "draft.md": "fixture\n",
  }),
  fixture("a nested file negation", {
    ".gitignore": "*.md\n",
    "docs/.gitignore": "!guide.md\n",
    "docs/guide.md": "fixture\n",
    "README.md": "fixture\n",
  }),
  fixture("a nested directory negation", {
    ".gitignore": "dist/\n",
    "packages/app/.gitignore": "!dist/\n",
    "packages/app/dist/README.md": "fixture\n",
  }),
  fixture("a nested scope overriding a root pattern", {
    ".gitignore": "*.log\n",
    "docs/.gitignore": "!keep.log\n",
    "docs/keep.log": "fixture\n",
    "root.log": "fixture\n",
  }),
  fixture("other parent rules below a re-included directory", {
    ".gitignore": "*.log\nbuild/\n",
    "docs/.gitignore": "!build/\n",
    "docs/build/a.md": "fixture\n",
    "docs/build/a.log": "fixture\n",
  }),
  fixture("a catch-all above a directory negation", {
    ".gitignore": "*\n!docs/\n",
    "docs/a.md": "fixture\n",
    "top.md": "fixture\n",
  }),
  fixture("the checkout exclude file", {
    ".git/info/exclude": "out/\n",
    "out/generated.md": "fixture\n",
    "keep.md": "fixture\n",
  }),
  fixture("a root negation overriding the checkout exclude file", {
    ".git/info/exclude": "*.log\n",
    ".gitignore": "!keep.log\n",
    "keep.log": "fixture\n",
    "drop.log": "fixture\n",
  }),
  fixture("a nested negation overriding the checkout exclude file", {
    ".git/info/exclude": "*.log\n",
    "docs/.gitignore": "!keep.log\n",
    "docs/keep.log": "fixture\n",
    "drop.log": "fixture\n",
  }),
  fixture("three nested ignore scopes", {
    ".gitignore": "*.md\n",
    "a/.gitignore": "!keep.md\n",
    "a/b/.gitignore": "keep.md\n",
    "a/keep.md": "fixture\n",
    "a/b/keep.md": "fixture\n",
  }),
  fixture("a name pattern stopped at a re-included directory", {
    ".gitignore": "__*\n",
    "pkg/.gitignore": "!__pycache__/\n",
    "pkg/__pycache__/keep.md": "fixture\n",
    "pkg/__pycache__/inner/keep.md": "fixture\n",
  }),
  fixture("an anchored nested negation", {
    ".gitignore": "build/\n",
    "x/.gitignore": "!/build/\n",
    "x/build/a.md": "fixture\n",
    "x/build/build/b.md": "fixture\n",
  }),
  fixture("an ignore file that ignores itself", {
    ".gitignore": ".gitignore\n*.log\n",
    "drop.log": "fixture\n",
    "keep.md": "fixture\n",
  }),
  {
    ...fixture("a vendored checkout", {
      "vendor/lib/README.md": "fixture\n",
      "top.md": "fixture\n",
    }),
    acceptedDivergence: true,
    nestedRepository: "vendor/lib",
  },
];

function rootPatternFixture(
  name: string,
  pattern: string,
  paths: readonly string[],
): DifferentialFixture {
  return fixture(name, {
    ".gitignore": pattern,
    ...Object.fromEntries(paths.map((file) => [file, "fixture\n"])),
  });
}

function fixture(name: string, files: Readonly<Record<string, string>>): DifferentialFixture {
  return { name, files };
}
