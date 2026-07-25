# Docsentry 操作指南

Docsentry 會把 Markdown 文件中的可驗證承諾，與同一個工作目錄中的程式碼、
設定檔、JSON Schema 及 GitHub Action 定義逐一比對。它不會存取網路、不會執行
文件內的命令，也不會自動改寫文件。

本指南以 v0.10.0 為準，適用於維護 CLI、套件、GitHub Action 或雙語文件的
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

### 讓 Docsentry 起草契約

不確定這個 repository 支援哪些契約時，可以先問它：

```bash
# 列出建議的契約，以及採用後會產生的 findings
npx docsentry suggest

# 直接把建議寫成起始設定（同樣不覆寫既有檔案）
npx docsentry init --suggest
```

`suggest` 會掃描工作目錄，對每個提案說明**支持它的檔案**，以及**採用後在目前
狀態會報出幾筆 finding**——讓你在採用前就知道這個契約是已經滿足，還是會立刻
變紅。它只是寫給維護者的草稿：不回報 finding、沒有自己的 exit code，也不會改寫
已提交的設定。

會被提案的有 package assertions、Action 範例、版本引用、schema 範例、文件配對
與路徑引用。列舉契約不在其中——提案一個列舉，等於猜測來源樣式與文件章節。

## 3. 加入文件契約

只有本地連結檢查時，最小設定就足夠。需要驗證其他承諾時，依需求加入下列區段；
不需要的區段可以省略。

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

### 讓文件跟著版本、路徑與結構走

v0.6.0 之後新增了四種契約，處理的是「文件寫死了某個會變的東西」這類漂移。

```json docsentry-config
{
  "$schema": "./node_modules/@carllee1983/docsentry/schema.json",
  "documents": ["README.md", "docs/**/*.md"],
  "versionReferences": [
    {
      "documents": ["README.md", "docs/install.md"],
      "pattern": "acme/example-action@v{version}",
      "label": "documented Action reference",
      "required": true
    }
  ],
  "pathReferences": [
    {
      "documents": ["README.md", "docs/**/*.md"],
      "include": ["src/**", "test/**", "*.json", "*.yml"],
      "exclude": [".acme-baseline.json"]
    }
  ],
  "directoryTrees": [
    {
      "documents": ["ARCHITECTURE.md"],
      "fenceLabel": "source-layout",
      "root": "src",
      "mode": "exact"
    }
  ],
  "enumerations": [
    {
      "documents": ["README.md"],
      "label": "supported format",
      "values": {
        "manifest": "schema.json",
        "pointer": ["/properties/format/enum"]
      },
      "documented": {
        "pattern": "[a-z]+",
        "section": "Output formats"
      }
    }
  ]
}
```

- **`versionReferences`** — 文件裡寫死的版本字串，對照本機 manifest 的版本值。
  `pattern` 至少要有一個 `{version}` 佔位符；`required: true` 表示每份選中的文件
  都必須出現這個字串。預設讀 `package.json` 的 `/version`，可用 `manifest` 與
  `evidence` 指向別處。
- **`pathReferences`** — 用 `include` glob 宣告哪些行內程式碼片段是 repository
  路徑，找不到就報錯。含空白、glob 中繼字元或只有副檔名的片段會被排除在契約外，
  `<name>.ts` 這類角括號佔位符也不會被當成路徑。`exclude` 用來排除「文件當成慣例
  提及、但不會提交進 repository」的檔名。
- **`directoryTrees`** — 文件裡以文字畫出的目錄樹，對照實際結構。`declared-exists`
  只要求寫出來的路徑存在；`exact` 額外要求沒有漏寫的檔案，適合用來鎖住模組邊界。
- **`enumerations`** — 文件列出的值集合，對照程式碼或 manifest。來源可以是
  `sources` + 正規表達式（從原始檔抓字面量），或 `manifest` + `pointer`（JSON
  pointer 指向陣列取其項目、指向物件取其鍵）。**注意 `documented` 那一側只會讀
  行內程式碼片段**，所以文件裡的值必須用反引號標記，粗體不算。

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

# 在 GitHub Actions 裡輸出行內註解
npx docsentry check --format github

# 只檢查這次 PR 受影響的文件與相依證據
npx docsentry check --changed origin/main

# 只檢查指定文件
npx docsentry check README.md docs/guide.md

# 檢視 Docsentry 從一份文件擷取到的 headings、links、code blocks 與行內片段
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

## 5. 在既有專案漸進導入

文件已經漂移一段時間的 repository，第一次執行會一次噴出所有 findings。與其為了
讓 CI 變綠而放寬契約，不如把現況記錄成基準：

```bash
npx docsentry baseline
```

這會產生 `.docsentry-baseline.json`，之後的 `check` 只回報**超出基準**的新問題。
基準記的是「每份文件、每個規則各有幾筆」，不是個別 finding——因為規則 ID 是相容性
介面，而訊息與行號不是；若以行號為鍵，只要在問題上方插入一行就會失效。

```bash
# 使用其他位置的基準檔（檔案不存在時視為指令錯誤）
npx docsentry check --baseline config/docsentry-baseline.json

# 忽略基準，回報所有 findings
npx docsentry check --no-baseline
```

`check` 會像尋找 `.docsentry.json` 一樣自動尋找基準檔。被抑制的 finding 不影響
exit code，終端與 JSON 報告會顯示 `suppressed` 數量；當基準中有條目已經對不上任何
finding，終端報告會說明有幾筆過期並建議重新記錄——但**不會自動改寫**已提交的檔案，
因為在檢查過程中改寫版控檔案會讓 CI 行為變得難以預期。

代價要知道：修好一筆 finding、又在同一份文件引入同規則的另一筆，不會被回報。

## 6. 在 GitHub Actions 導入

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
      - uses: CarlLee1983/Docsentry@v0.10.0
        with:
          config: .docsentry.json
          format: github
```

`config` 留空時，Action 會檢查所有 Markdown 文件，但不會啟用需設定檔的契約。
`format` 可為 `terminal`、`json`、`sarif` 或 `github`；若 repository 位於工作區
子目錄，設定 `working-directory` 為該相對路徑。

`format: github` 會輸出 GitHub Actions 的 workflow commands，讓每筆 finding 直接
以行內註解出現在 pull request 的對應行列上。它只寫標準輸出、不呼叫任何 API，所以
不需要 token，檢查也維持離線與可重現。

## 7. 常見 finding 的處理方式

| Finding | 優先檢查 |
| --- | --- |
| `DOC_LINK_MISSING` | 修正連結目標，或把遺漏檔案納入 repository。 |
| `DOC_LINK_ANCHOR_MISSING` | 更新 `#anchor` 以對應目標 Markdown 的 heading。 |
| `DOC_LINK_OUTSIDE_REPOSITORY` | 移除或修正指向 checkout 外部的 symlink／本地連結。 |
| `DOC_SCRIPT_UNKNOWN` | 更新文件命令，或確認 `package.json` 是否少了預期 script。 |
| `DOC_PACKAGE_ASSERTION_MISMATCH` | 文件重述的 manifest 值已過期，改文件或改 manifest。 |
| `DOC_SCHEMA_INVALID` | 依 schema 修正被選取的 JSON 或 YAML 範例。 |
| `DOC_ACTION_INPUT_UNKNOWN` | 修正 `with:` key，並確認 `uses` 選到正確的 Action。 |
| `DOC_PAIR_*_MISMATCH` | 使鏡像文件的 headings、commands 或 code blocks 與 canonical 一致。 |
| `DOC_VERSION_STALE` | 文件寫的版本落後 manifest，通常是發版後忘了更新。 |
| `DOC_VERSION_REFERENCE_MISSING` | `required: true` 的文件完全沒出現該版本字串。 |
| `DOC_PATH_MISSING` | 修正路徑，或用 `exclude` 把它排除在契約外。 |
| `DOC_TREE_PATH_MISSING` | 目錄樹寫了不存在的路徑。 |
| `DOC_TREE_PATH_UNDOCUMENTED` | `exact` 模式下有實際存在但樹裡漏寫的檔案。 |
| `DOC_TREE_UNPARSED` | 目錄樹的某幾行無法解析，通常是縮排或框線字元不一致。 |
| `DOC_ENUM_UNDOCUMENTED` | 程式碼有這個值，文件的清單漏了。 |
| `DOC_ENUM_UNKNOWN` | 文件列了程式碼裡不存在的值，通常是刪掉功能後忘了改文件。 |
| `DOC_ENUM_SECTION_MISSING` | 找不到設定中指定的 `section` heading。 |

完整規則識別碼與輸出欄位契約請見 [SPEC.md](../SPEC.md)；領域詞彙見
[CONTEXT.md](../CONTEXT.md)。若需要確認文件實際被解析出的內容，先執行
`npx docsentry inspect <document>`，通常比直接猜測規則行為更快。

## 8. 維護建議

在文件、`package.json`、schema 或 `action.yml` 一起變更的 PR，先在本機跑完整
`npx docsentry check`；大型 repository 的日常 PR 再使用 `--changed <base>` 取得
較快的回饋。發版前，Docsentry 自身可執行：

```bash
npm run release:verify
```

此流程會進行型別檢查、測試、建置與嚴格 release tag 驗證。建立 release tag 前，
另可用 `npm run tag:next` 預覽 Tagsmith 將採用的下一個版本。

發版後最容易漏掉的是文件裡寫死的版本字串。與其靠記憶，不如把這份指南本身也納入
`versionReferences`——本 repository 就是這樣做的，所以上面那段 workflow 範例裡的
版本號如果落後於 `package.json`，CI 會直接失敗。
