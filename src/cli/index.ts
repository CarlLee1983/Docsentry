#!/usr/bin/env node

import { pathToFileURL } from "node:url";

import { InvocationError } from "../core/errors.js";
import type { VerificationReport } from "../core/finding.js";
import { verifyRepository } from "../core/verify.js";
import { changedFiles } from "./changed-files.js";
import { inspectDocument } from "./inspect.js";
import { initialize } from "./init.js";
import { renderJson } from "../reporters/json.js";
import { renderSarif } from "../reporters/sarif.js";
import { renderTerminal } from "../reporters/terminal.js";

export async function main(
  arguments_: readonly string[],
  io: { stdout(message: string): void; stderr(message: string): void } = {
    stdout: (message) => process.stdout.write(message),
    stderr: (message) => process.stderr.write(message),
  },
): Promise<number> {
  try {
    const [command, ...argumentsAfterCommand] = arguments_;
    if (command === undefined || command === "--help" || command === "-h") {
      io.stdout(renderHelp());
      return 0;
    }
    if (command === "help") {
      if (argumentsAfterCommand.length > 1) throw new InvocationError("Usage: docsentry help [command]");
      io.stdout(renderHelp(argumentsAfterCommand[0]));
      return 0;
    }
    if (command === "init") {
      if (isHelpRequest(argumentsAfterCommand)) {
        io.stdout(renderHelp(command));
        return 0;
      }
      if (argumentsAfterCommand.length > 0) throw new InvocationError("docsentry init accepts no arguments");
      io.stdout(`Created ${await initialize(process.cwd())}\n`);
      return 0;
    }
    if (command === "inspect") {
      if (isHelpRequest(argumentsAfterCommand)) {
        io.stdout(renderHelp(command));
        return 0;
      }
      if (argumentsAfterCommand.length !== 1) throw new InvocationError("Usage: docsentry inspect <document>");
      io.stdout(await inspectDocument(process.cwd(), argumentsAfterCommand[0]));
      return 0;
    }
    if (command === "check") {
      if (isHelpRequest(argumentsAfterCommand)) {
        io.stdout(renderHelp(command));
        return 0;
      }
      const options = checkOptions(argumentsAfterCommand);
      const report = await verifyRepository({
        root: process.cwd(),
        documents: options.documents.length > 0 ? options.documents : undefined,
        configPath: options.configPath,
        changedPaths: options.changedBase ? await changedFiles(process.cwd(), options.changedBase) : undefined,
      });
      io.stdout(renderReport(options.format, report));
      return report.summary.errors > 0 ? 1 : 0;
    }
    throw new InvocationError("Usage: docsentry <init|check|inspect> [options]");
  } catch (error: unknown) {
    io.stderr(`docsentry: ${messageOf(error)}\n`);
    return 2;
  }
}

function isHelpRequest(arguments_: readonly string[]): boolean {
  return arguments_.length === 1 && (arguments_[0] === "--help" || arguments_[0] === "-h");
}

function renderHelp(command?: string): string {
  if (command === undefined) {
    return [
      "Usage: docsentry <command> [options]",
      "",
      "Commands:",
      "  init                 Create a starter .docsentry.json configuration.",
      "  check [paths...]     Verify documentation contracts.",
      "  inspect <document>   Print extracted document facts.",
      "",
      "Run docsentry help <command> for command-specific options.",
      "",
    ].join("\n");
  }
  if (command === "init") return "Usage: docsentry init\n\nCreate a starter .docsentry.json without overwriting an existing file.\n";
  if (command === "inspect") return "Usage: docsentry inspect <document>\n\nPrint headings, links, and code blocks from one Markdown document.\n";
  if (command === "check") {
    return [
      "Usage: docsentry check [paths...] [options]",
      "       docsentry check --changed <base> [options]",
      "",
      "Options:",
      "  --changed <base>  Check documents affected since the Git merge base; cannot be combined with paths.",
      "  --config <path>   Read configuration from a path other than .docsentry.json.",
      "  --format <format> Render terminal (default), json, or sarif output.",
      "",
    ].join("\n");
  }
  throw new InvocationError(`Unknown command: ${command}`);
}

type CheckOptions = {
  configPath?: string;
  changedBase?: string;
  format: "terminal" | "json" | "sarif";
  documents: string[];
};

function checkOptions(arguments_: readonly string[]): CheckOptions {
  const result: CheckOptions = { documents: [], format: "terminal" };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--config") {
      const configPath = arguments_[index + 1];
      if (!configPath) throw new InvocationError("--config requires a path");
      result.configPath = configPath;
      index += 1;
    } else if (argument === "--changed") {
      const changedBase = arguments_[index + 1];
      if (!changedBase || changedBase.startsWith("-")) throw new InvocationError("--changed requires a Git revision");
      if (result.changedBase) throw new InvocationError("--changed may only be specified once");
      result.changedBase = changedBase;
      index += 1;
    } else if (argument === "--format") {
      const format = arguments_[index + 1];
      if (format !== "json" && format !== "sarif" && format !== "terminal") {
        throw new InvocationError("--format must be json, sarif, or terminal");
      }
      result.format = format;
      index += 1;
    } else if (argument.startsWith("-")) {
      throw new InvocationError(`Unknown option: ${argument}`);
    } else {
      result.documents.push(argument);
    }
  }
  if (result.changedBase && result.documents.length > 0) {
    throw new InvocationError("--changed cannot be combined with explicit document paths");
  }
  return result;
}

function renderReport(format: CheckOptions["format"], report: VerificationReport): string {
  if (format === "json") return renderJson(report);
  if (format === "sarif") return renderSarif(report);
  return renderTerminal(report);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
