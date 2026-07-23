import type { RepositoryReader } from "../repository/reader.js";

export type PackageEvidence = {
  path: string;
  value: Record<string, unknown>;
};

export async function readPackageEvidence(
  reader: RepositoryReader,
  packagePath: string,
): Promise<PackageEvidence> {
  let value: unknown;
  try {
    value = JSON.parse(await reader.readText(packagePath));
  } catch (error: unknown) {
    throw new Error(`Cannot parse ${packagePath}: ${messageOf(error)}`);
  }
  if (!isRecord(value)) throw new Error(`${packagePath} must contain a JSON object`);
  return { path: packagePath, value };
}

export function jsonPointer(value: unknown, pointer: string): unknown {
  if (pointer === "") return value;
  if (!pointer.startsWith("/")) return undefined;
  return pointer
    .slice(1)
    .split("/")
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce<unknown>((current, part) => {
      if (isRecord(current)) return current[part];
      if (Array.isArray(current)) return current[Number(part)];
      return undefined;
    }, value);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
