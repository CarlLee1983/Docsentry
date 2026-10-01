import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * 判斷模組是否為本次執行的進入點。npm 以符號連結安裝 bin，
 * `process.argv[1]` 是連結路徑而 `import.meta.url` 是實際路徑，
 * 因此兩邊都先解析成實際路徑再比較。
 */
export function isEntryPoint(scriptPath: string | undefined, moduleUrl: string): boolean {
  if (!scriptPath) return false;
  try {
    return realpathSync(scriptPath) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}
