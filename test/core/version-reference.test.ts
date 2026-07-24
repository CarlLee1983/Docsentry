import { describe, expect, it } from "vitest";

import { InvocationError } from "../../src/core/errors.js";
import { DocsentryVerificationEngine } from "../../src/core/verify.js";
import { MemoryRepositoryReader } from "../../src/repository/memory-reader.js";

const manifest = (version: string): string => JSON.stringify({ name: "@carllee1983/docsentry", version });

describe("version reference contract", () => {
  it("reports a documented version that no longer matches its package evidence", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          documents: ["README.md"],
          versionReferences: [
            {
              documents: ["README.md"],
              pattern: "CarlLee1983/Docsentry@v{version}",
              label: "documented Action reference",
            },
          ],
        }),
        "README.md": `# Docsentry

\`\`\`yaml
steps:
  - uses: CarlLee1983/Docsentry@v0.5.0
\`\`\`
`,
        "package.json": manifest("0.6.0"),
      }),
    );

    const report = await engine.verify({ root: "." });

    expect(report.findings).toMatchObject([
      {
        rule: "DOC_VERSION_STALE",
        severity: "error",
        message: expect.stringContaining("0.6.0"),
        document: { path: "README.md", line: 5, column: 34 },
        evidence: { path: "package.json", pointer: "/version" },
      },
    ]);
    expect(report.findings[0]?.message).toContain("0.5.0");
  });

  it("accepts a current version and ignores unrelated version literals", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          documents: ["README.md", "CHANGELOG.md"],
          versionReferences: [
            { documents: ["README.md"], pattern: "CarlLee1983/Docsentry@v{version}" },
          ],
        }),
        "README.md": "Use `CarlLee1983/Docsentry@v0.6.0`. Earlier releases were v0.1.0 and v0.5.0.\n",
        "CHANGELOG.md": "## v0.5.0\n\n## v0.4.0\n",
        "package.json": manifest("0.6.0"),
      }),
    );

    await expect(engine.verify({ root: "." })).resolves.toMatchObject({
      findings: [],
      summary: { errors: 0, warnings: 0 },
    });
  });

  it("reports every stale occurrence and locates each version literal", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          versionReferences: [{ documents: ["README.md"], pattern: "docsentry@{version}" }],
        }),
        "README.md": "npm i docsentry@0.5.0\n\nnpm i docsentry@0.6.0\n\nnpm i docsentry@0.4.0\n",
        "package.json": manifest("0.6.0"),
      }),
    );

    const report = await engine.verify({ root: "." });

    expect(report.findings).toMatchObject([
      { rule: "DOC_VERSION_STALE", document: { line: 1, column: 17 } },
      { rule: "DOC_VERSION_STALE", document: { line: 5, column: 17 } },
    ]);
  });

  it("reports a required reference that a document never states", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          versionReferences: [
            {
              documents: ["README.md"],
              pattern: "CarlLee1983/Docsentry@v{version}",
              label: "documented Action reference",
              required: true,
            },
          ],
        }),
        "README.md": "# Docsentry\n",
        "package.json": manifest("0.6.0"),
      }),
    );

    await expect(engine.verify({ root: "." })).resolves.toMatchObject({
      findings: [
        {
          rule: "DOC_VERSION_REFERENCE_MISSING",
          severity: "error",
          document: { path: "README.md", line: 1, column: 1 },
        },
      ],
    });
  });

  it("stays silent for an absent optional reference", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          versionReferences: [{ documents: ["README.md"], pattern: "docsentry@v{version}" }],
        }),
        "README.md": "# Docsentry\n",
        "package.json": manifest("0.6.0"),
      }),
    );

    await expect(engine.verify({ root: "." })).resolves.toMatchObject({ findings: [] });
  });

  it("reports unusable evidence at the documented reference", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          versionReferences: [
            { documents: ["README.md"], pattern: "docsentry@v{version}", evidence: "/absent" },
          ],
        }),
        "README.md": "Install `docsentry@v0.5.0`.\n",
        "package.json": manifest("0.6.0"),
      }),
    );

    await expect(engine.verify({ root: "." })).resolves.toMatchObject({
      findings: [
        {
          rule: "DOC_VERSION_EVIDENCE_UNAVAILABLE",
          severity: "error",
          document: { path: "README.md", line: 1, column: 21 },
          evidence: { path: "package.json", pointer: "/absent" },
        },
      ],
    });
  });

  it("reports a missing manifest at the documented reference", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          versionReferences: [{ documents: ["README.md"], pattern: "docsentry@v{version}" }],
        }),
        "README.md": "Install `docsentry@v0.5.0`.\n",
      }),
    );

    await expect(engine.verify({ root: "." })).resolves.toMatchObject({
      findings: [{ rule: "DOC_VERSION_EVIDENCE_UNAVAILABLE", document: { path: "README.md", line: 1 } }],
    });
  });

  it("matches a prerelease version", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          versionReferences: [{ documents: ["README.md"], pattern: "docsentry@{version}" }],
        }),
        "README.md": "npm i docsentry@0.6.0-rc.1\n",
        "package.json": manifest("0.6.0-rc.1"),
      }),
    );

    await expect(engine.verify({ root: "." })).resolves.toMatchObject({ findings: [] });
  });

  it("selects version reference documents when the package manifest changes", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          documents: ["README.md", "docs/unrelated.md"],
          versionReferences: [{ documents: ["README.md"], pattern: "docsentry@v{version}" }],
        }),
        "README.md": "Install `docsentry@v0.5.0`.\n",
        "docs/unrelated.md": "[Unrelated missing document](missing.md)\n",
        "package.json": manifest("0.6.0"),
      }),
    );

    const report = await engine.verify({ root: ".", changedPaths: ["package.json"] });

    expect(report.findings).toMatchObject([
      { rule: "DOC_VERSION_STALE", document: { path: "README.md", line: 1 } },
    ]);
  });

  it("uses a configured manifest and evidence pointer", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          versionReferences: [
            {
              documents: ["README.md"],
              manifest: "action-manifest.json",
              evidence: "/release/tag",
              pattern: "release {version}",
            },
          ],
        }),
        "README.md": "The current release 1.2.3 is documented here.\n",
        "action-manifest.json": JSON.stringify({ release: { tag: "1.2.4" } }),
      }),
    );

    await expect(engine.verify({ root: "." })).resolves.toMatchObject({
      findings: [
        {
          rule: "DOC_VERSION_STALE",
          document: { path: "README.md", line: 1 },
          evidence: { path: "action-manifest.json", pointer: "/release/tag" },
        },
      ],
    });
  });

  it("rejects a pattern without a version placeholder", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          versionReferences: [{ documents: ["README.md"], pattern: "docsentry@v0.5.0" }],
        }),
      }),
    );

    await expect(engine.verify({ root: "." })).rejects.toBeInstanceOf(InvocationError);
  });

  it("rejects an unknown version reference property", async () => {
    const engine = new DocsentryVerificationEngine(
      new MemoryRepositoryReader({
        ".docsentry.json": JSON.stringify({
          versionReferences: [
            { documents: ["README.md"], pattern: "docsentry@v{version}", unsupported: true },
          ],
        }),
      }),
    );

    await expect(engine.verify({ root: "." })).rejects.toThrow("unknown property unsupported");
  });
});
