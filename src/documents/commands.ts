import type { SourceLocation } from "../core/finding.js";
import type { DocumentFact } from "./markdown.js";

export type DocumentCommand = {
  text: string;
  location: SourceLocation;
};

const shellLanguages = new Set(["bash", "console", "shell", "sh", "terminal", "zsh"]);

export function extractShellCommands(document: DocumentFact): readonly DocumentCommand[] {
  const commands: DocumentCommand[] = [];
  for (const block of document.codeBlocks) {
    if (!block.language || !shellLanguages.has(block.language)) continue;
    block.value.split("\n").forEach((line, index) => {
      const text = line.trim();
      if (!text || text.startsWith("#")) return;
      commands.push({
        text,
        location: {
          path: document.path,
          line: block.location.line + index + 1,
          column: Math.max(1, line.search(/\S/) + 1),
        },
      });
    });
  }
  return commands;
}

export function packageScriptName(command: string): string | undefined {
  const match = /^(?:[$#]\s*)?(?:npm|pnpm|yarn)\s+run\s+([A-Za-z0-9][A-Za-z0-9:_-]*)\b/.exec(command);
  return match?.[1];
}
