#!/usr/bin/env node

import { pathToFileURL } from "node:url";

import { InvocationError } from "../core/errors.js";
import { verifyRepository } from "../core/verify.js";
import { changedFiles } from "./changed-files.js";
import { inspectDocument } from "./inspect.js";
import { initialize } from "./init.js";
import { renderJson } from "../reporters/json.js";
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
    if (command === "init") {
      if (argumentsAfterCommand.length > 0) throw new InvocationError("docsentry init accepts no arguments");
      io.stdout(`Created ${await initialize(process.cwd())}\n`);
      return 0;
    }
    if (command === "inspect") {
      if (argumentsAfterCommand.length !== 1) throw new InvocationError("Usage: docsentry inspect <document>");
      io.stdout(await inspectDocument(process.cwd(), argumentsAfterCommand[0]));
      return 0;
    }
    if (command === "check") {
      const options = checkOptions(argumentsAfterCommand);
      const report = await verifyRepository({
        root: process.cwd(),
        documents: options.documents.length > 0 ? options.documents : undefined,
        configPath: options.configPath,
        changedPaths: options.changedBase ? await changedFiles(process.cwd(), options.changedBase) : undefined,
      });
      io.stdout(options.format === "json" ? renderJson(report) : renderTerminal(report));
      return report.summary.errors > 0 ? 1 : 0;
    }
    throw new InvocationError("Usage: docsentry <init|check|inspect> [options]");
  } catch (error: unknown) {
    io.stderr(`docsentry: ${messageOf(error)}\n`);
    return 2;
  }
}

type CheckOptions = {
  configPath?: string;
  changedBase?: string;
  format: "terminal" | "json";
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
      if (format !== "json" && format !== "terminal") {
        throw new InvocationError("--format must be json or terminal");
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

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
