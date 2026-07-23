# Docsentry 操作指南

Docsentry 會把 Markdown 文件中的可驗證承諾，與同一個工作目錄中的程式碼、
設定檔、JSON Schema 及 GitHub Action 定義逐一比對。它不會存取網路、不會執行
文件內的命令，也不會自動改寫文件。

本指南以 v0.5.0 為準，適用於維護 CLI、套件、GitHub Action 或雙語文件的
repository。

## 1. 安裝需求

- Node.js 20 以上。
- 專案已安裝相依套件，或可使用 npm 安裝 Docsentry。
- 若要使用 `--changed`，本機必須有 Git 與指定的 base revision；其他模式不會
  呼叫 Git。

將 Docsentry 加入專案的開發相依：

```bash
npm install --save-dev @carllee1983/docsentry
```

以下指令假設從 repository 根目錄執行；以 `npx docsentry` 取代全域安裝，能確保
團隊與 CI 使用專案鎖定的版本。

## 2. 建立最小設定

先建立 `.docsentry.json`：

```bash
npx docsentry init
```

這會建立下列設定，且在檔案已存在時停止，不會覆寫既有內容：

```json docsentry-config
{
  "$schema": "./node_modules/@carllee1983/docsentry/schema.json",
  "documents": ["README.md", "docs/**/*.md"]
}
```

`documents` 接受 repository 相對路徑或 glob pattern。保留 `$schema` 可讓支援
JSON Schema 的編輯器提供自動完成，且 Docsentry 在執行時也會拒絕未知的設定欄位。

## 3. 加入文件契約

只有本地連結檢查時，最小設定就足夠。需要驗證套件資訊、結構化範例、Action 範例
或雙語文件時，依需求加入下列區段；不需要的區段可以省略。

```json docsentry-config
{
  "$schema": "./node_modules/@carllee1983/docsentry/schema.json",
  "documents": ["README.md", "docs/**/*.md"],
  "package": {
    "manifest": "package.json",
    "assertions": [
      {
        "document": "README.md",
        "label": "published package name",
        "value": "@acme/example",
        "evidence": "/name"
      }
    ]
  },
  "schemaExamples": [
    {
      "documents": ["README.md", "docs/**/*.md"],
      "language": "json",
      "schema": "schema.json",
      "fenceLabel": "product-config"
    }
  ],
  "actionExamples": [
    {
      "documents": ["README.md"],
      "action": "action.yml",
      "uses": "acme/example-action"
    }
  ],
  "documentPairs": [
    {
      "canonical": "README.md",
      "mirror": "docs/README.zh-TW.md",
      "requireSame": ["headings", "commands", "codeBlocks"]
    }
  ]
}
```

使用 `schemaExamples[].fenceLabel` 時，只會驗證帶有相同標籤的圍欄程式碼區塊，
例如 ```` ```json product-config ````。未設定標籤時，所有相符語言的 JSON、YAML
或 YML 區塊都會被驗證。

在同一份 workflow 範例有多個 `uses:` steps 時，請設定
`actionExamples[].uses`。Docsentry 會忽略 `@v1` 這類版本尾碼，只驗證目標 Action
的 `with:` keys，並把未知 input 指向 YAML key 的實際位置。

## 4. 本機檢查

完整檢查：

```bash
npx docsentry check
```

常用變體：

```bash
# 指定設定檔與機器可讀的輸出
npx docsentry check --config .docsentry.json --format json

# 產生供 code-scanning consumer 使用的 SARIF 2.1.0 檔案
npx docsentry check --format sarif > docsentry.sarif

# 只檢查這次 PR 受影響的文件與相依證據
npx docsentry check --changed origin/main

# 只檢查指定文件
npx docsentry check README.md docs/guide.md

# 檢視 Docsentry 從一份文件擷取到的 headings、links 與 code blocks
npx docsentry inspect README.md
```

`check` 會收集所有可發現的 findings，而不是遇到第一個錯誤就停止。每筆 finding
都含規則 ID、文件行列、訊息，以及可用時的 evidence 位置與修正建議。結束狀態：

| Exit code | 意義 |
| --- | --- |
| `0` | 沒有 error findings。warning 仍會輸出，但預設不使 CI 失敗。 |
| `1` | 找到至少一個 error finding。 |
| `2` | 指令或設定無法處理，例如不支援的 option 或設定檔格式錯誤。 |

需要 CLI 說明時，不必讀取 repository：

```bash
npx docsentry --help
npx docsentry help check
```

## 5. 在 GitHub Actions 導入

將以下 step 放在 checkout 之後。Action 使用所指定版本內建的 Docsentry 程式碼，
在 caller repository 執行檢查，並固定使用 Node.js 20。

```yaml
name: Documentation governance

on:
  pull_request:
    paths:
      - "**/*.md"
      - ".docsentry.json"
      - "package.json"
      - "schema.json"
      - "action.yml"

jobs:
  docsentry:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: CarlLee1983/Docsentry@v0.5.0
        with:
          config: .docsentry.json
          format: terminal
```

`config` 留空時，Action 會檢查所有 Markdown 文件，但不會啟用需設定檔的 package、
schema、Action 或文件配對契約。`format` 可為 `terminal`、`json` 或 `sarif`；若
repository 位於工作區子目錄，設定 `working-directory` 為該相對路徑。

## 6. 常見 finding 的處理方式

| Finding | 優先檢查 |
| --- | --- |
| `DOC_LINK_MISSING` | 修正連結目標，或把遺漏檔案納入 repository。 |
| `DOC_LINK_ANCHOR_MISSING` | 更新 `#anchor` 以對應目標 Markdown 的 heading。 |
| `DOC_LINK_OUTSIDE_REPOSITORY` | 移除或修正指向 checkout 外部的 symlink／本地連結。 |
| `DOC_SCRIPT_UNKNOWN` | 更新文件命令，或確認 `package.json` 是否少了預期 script。 |
| `DOC_SCHEMA_INVALID` | 依 schema 修正被選取的 JSON 或 YAML 範例。 |
| `DOC_ACTION_INPUT_UNKNOWN` | 修正 `with:` key，並確認 `uses` 選到正確的 Action。 |
| `DOC_PAIR_*_MISMATCH` | 使鏡像文件的 headings、commands 或 code blocks 與 canonical 一致。 |

完整規則識別碼與輸出欄位契約請見 [SPEC.md](../SPEC.md)。若需要確認文件實際被
解析出的內容，先執行 `npx docsentry inspect <document>`，通常比直接猜測規則行為
更快。

## 7. 維護建議

在文件、`package.json`、schema 或 `action.yml` 一起變更的 PR，先在本機跑完整
`npx docsentry check`；大型 repository 的日常 PR 再使用 `--changed <base>` 取得
較快的回饋。發版前，Docsentry 自身可執行：

```bash
npm run release:verify
```

此流程會進行型別檢查、測試、建置與嚴格 release tag 驗證。建立 release tag 前，
另可用 `npm run tag:next` 預覽 Tagsmith 將採用的下一個版本。
