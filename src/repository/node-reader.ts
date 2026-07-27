import { readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";

import { minimatch } from "minimatch";

import { InvocationError, RepositoryPathError } from "../core/errors.js";
import { normalizeRepositoryPath } from "./path.js";
import type { RepositoryReader } from "./reader.js";

/**
 * Git never descends into a `.git` directory and never records one in an ignore
 * file, so it is the single name the checkout cannot declare for itself. Every
 * other exclusion is read from the checkout's own ignore files, because a name
 * hard-coded here is a guess about which ecosystem the repository belongs to.
 */
const gitDirectory = ".git";

/** Git skips this if an ignore file opens with it. */
const byteOrderMark = "\uFEFF";

/**
 * The matcher speaks a wider glob dialect than an ignore file does, so the
 * options narrow it to Git's: `dot` because an ignore pattern's `*` covers
 * `.hidden`, and `nobrace` and `noext` because `{a,b}` and `+(a)` are literal
 * filename characters to Git — expanding them would both miss the file it names
 * and silently drop the files it does not. `nocomment` and `nonegate` are off
 * because a leading `#` or `!` is handled while the pattern is compiled.
 *
 * Case sensitivity is left at the default, which is Git's own default and the
 * behaviour in Linux CI; a repository that has set `core.ignoreCase` will
 * disagree, and reading that setting means reading Git's configuration.
 */
const matchOptions = {
  dot: true,
  nocomment: true,
  nonegate: true,
  nobrace: true,
  noext: true,
} as const;

export class NodeRepositoryReader implements RepositoryReader {
  readonly root: string;
  private readonly resolvedRoot: Promise<string>;

  constructor(root: string) {
    this.root = path.resolve(root);
    this.resolvedRoot = realpath(this.root);
  }

  async readText(relativePath: string): Promise<string> {
    return readFile(await this.toAbsolute(relativePath), "utf8");
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      await this.toAbsolute(relativePath);
      return true;
    } catch (error: unknown) {
      if (isMissing(error)) return false;
      throw error;
    }
  }

  async listFiles(): Promise<readonly string[]> {
    const files: string[] = [];
    const root = await this.resolvedRoot;
    await this.walk(root, root, files, await readExcludeScope(root));
    return files.sort((left, right) => left.localeCompare(right));
  }

  private async walk(
    root: string,
    directory: string,
    files: string[],
    inherited: readonly IgnoreScope[],
  ): Promise<void> {
    const base = path.relative(root, directory).replaceAll(path.sep, "/");
    const lines = await readIgnoreLines(root, path.join(directory, ".gitignore"));
    const scopes = lines ? [...inherited, buildScope(base, lines)] : inherited;
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === gitDirectory) continue;
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).replaceAll(path.sep, "/");
      if (entry.isDirectory()) {
        if (isIgnored(scopes, relative, true)) continue;
        await this.walk(root, absolute, files, scopes);
      } else if (entry.isFile() && !isIgnored(scopes, relative, false)) {
        files.push(relative);
      }
    }
  }

  private async toAbsolute(relativePath: string): Promise<string> {
    const normalized = normalizeRepositoryPath(relativePath);
    const absolute = path.resolve(this.root, normalized);
    const relative = path.relative(this.root, absolute);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new InvocationError(`Path must stay inside the repository: ${relativePath}`);
    }
    const [root, resolvedPath] = await Promise.all([this.resolvedRoot, realpath(absolute)]);
    if (!isWithin(root, resolvedPath)) {
      throw new RepositoryPathError(`Path resolves outside the repository: ${relativePath}`);
    }
    return resolvedPath;
  }
}

/**
 * One pattern line, compiled on its own and carrying the three properties Git
 * uses to decide what a pattern is matched against.
 */
interface IgnorePattern {
  /** `!` reverses the decision instead of making one. */
  readonly negated: boolean;
  /** A trailing `/` restricts the pattern to directories. */
  readonly directoryOnly: boolean;
  /** A `/` anywhere but the end matches the whole relative path, not the name. */
  readonly wholePath: boolean;
  /** The pattern body, with the trailing and anchoring slashes already removed. */
  readonly glob: string;
}

/**
 * One ignore file and the directory its patterns resolve against. A scope's
 * `base` is always an ancestor of the paths it is tested against, which is what
 * lets {@link scopedPath} strip the prefix by length; `walk` maintains that by
 * only ever appending the directory it is currently visiting.
 */
interface IgnoreScope {
  readonly base: string;
  readonly patterns: readonly IgnorePattern[];
}

function buildScope(base: string, lines: readonly string[]): IgnoreScope {
  const patterns: IgnorePattern[] = [];
  for (const line of lines) {
    const pattern = compilePattern(line);
    if (pattern) patterns.push(pattern);
  }
  return { base, patterns };
}

function compilePattern(line: string): IgnorePattern | undefined {
  const trimmed = stripTrailingBlanks(line);
  if (trimmed === "" || trimmed.startsWith("#")) return undefined;
  const negated = trimmed.startsWith("!");
  // A leading `!` or `#` can be escaped to mean itself.
  const body = negated ? trimmed.slice(1) : trimmed.replace(/^\\(?=[!#])/, "");
  if (body === "" || body === "/") return undefined;
  const directoryOnly = body.endsWith("/");
  const withoutTrailingSlash = directoryOnly ? body.slice(0, -1) : body;
  return {
    negated,
    directoryOnly,
    wholePath: withoutTrailingSlash.includes("/"),
    // A leading slash anchors the pattern to its own ignore file's directory,
    // which is already what a whole-path subject is relative to.
    glob: withoutTrailingSlash.startsWith("/") ? withoutTrailingSlash.slice(1) : withoutTrailingSlash,
  };
}

/**
 * Git strips trailing spaces unless a backslash escapes them. Tabs are not
 * stripped — a pattern ending in one matches nothing in Git, so removing it here
 * would quietly bring a dead pattern back to life. A stray carriage return is
 * removed because it is a line ending rather than part of the pattern; keeping
 * it would turn `docs/` into something that is neither a directory pattern nor
 * a name.
 */
function stripTrailingBlanks(line: string): string {
  let end = line.length;
  while (end > 0 && (line[end - 1] === " " || line[end - 1] === "\r")) {
    if (line[end - 2] === "\\") break;
    end -= 1;
  }
  return line.slice(0, end);
}

/**
 * `.git/info/exclude` holds ignore patterns that are local to a checkout rather
 * than committed with it. It ranks below every `.gitignore`, so it enters as the
 * outermost scope. A global excludes file is deliberately not read: it lives
 * outside the checkout, and nothing outside the checkout is evidence.
 */
async function readExcludeScope(root: string): Promise<readonly IgnoreScope[]> {
  const lines = await readIgnoreLines(root, path.join(root, gitDirectory, "info", "exclude"));
  return lines ? [buildScope("", lines)] : [];
}

async function readIgnoreLines(root: string, filePath: string): Promise<readonly string[] | undefined> {
  let resolved: string;
  try {
    resolved = await realpath(filePath);
  } catch (error: unknown) {
    if (isAbsent(error)) return undefined;
    throw unreadable(filePath, error);
  }
  // Git opens an ignore file with `O_NOFOLLOW`. Following a symlink here would
  // let a file committed to the repository apply rules read from outside it.
  if (!isWithin(root, resolved)) return undefined;
  try {
    // Git skips a byte-order mark. Leaving it attached to the first pattern
    // would make that one pattern silently match nothing.
    const contents = await readFile(resolved, "utf8");
    return (contents.startsWith(byteOrderMark) ? contents.slice(1) : contents).split(/\r?\n/);
  } catch (error: unknown) {
    if (isAbsent(error)) return undefined;
    throw unreadable(filePath, error);
  }
}

function scopedPath(scope: IgnoreScope, candidate: string): string {
  return scope.base === "" ? candidate : candidate.slice(scope.base.length + 1);
}

/**
 * Decide whether one entry is ignored, consulting scopes from the deepest
 * outwards and stopping at the first that has an opinion, which is how Git ranks
 * a nested ignore file above the one enclosing it.
 *
 * Every question is asked about the entry itself. The walk has already decided
 * every directory above it and never descends into an excluded one, so a pattern
 * that matched an ancestor has nothing left to say here — which is why a pattern
 * is matched the way Git matches it, against a name or against a whole relative
 * path, rather than against the ancestry the path happens to carry.
 */
function isIgnored(scopes: readonly IgnoreScope[], relative: string, isDirectory: boolean): boolean {
  const name = relative.slice(relative.lastIndexOf("/") + 1);
  for (let index = scopes.length - 1; index >= 0; index -= 1) {
    const scope = scopes[index];
    const decision = decideInScope(scope, scopedPath(scope, relative), name, isDirectory);
    if (decision !== undefined) return decision;
  }
  return false;
}

/** Within one ignore file the last pattern that matches decides. */
function decideInScope(
  scope: IgnoreScope,
  wholePath: string,
  name: string,
  isDirectory: boolean,
): boolean | undefined {
  for (let index = scope.patterns.length - 1; index >= 0; index -= 1) {
    const pattern = scope.patterns[index];
    if (pattern.directoryOnly && !isDirectory) continue;
    const subject = pattern.wholePath ? wholePath : name;
    if (minimatch(subject, pattern.glob, matchOptions)) return !pattern.negated;
  }
  return undefined;
}

function unreadable(filePath: string, cause: unknown): InvocationError {
  const reason = cause instanceof Error ? cause.message : String(cause);
  return new InvocationError(`Cannot read ${filePath}: ${reason}`, { cause });
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function isMissing(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && (error as NodeJS.ErrnoException).code === "ENOENT";
}

/** A repository entry that is absent or unusable, as distinct from one that cannot be read. */
function isAbsent(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code } = error as NodeJS.ErrnoException;
  return code === "ENOENT" || code === "ENOTDIR" || code === "ELOOP" || code === "EISDIR";
}
