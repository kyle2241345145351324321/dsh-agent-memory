# 發佈手冊（npm + DSH Plugin Hub）

套件名稱：`@kylefu/dsh-agent-memory`
GitHub：`https://github.com/kyle2241345145351324321/dsh-agent-memory`
分類（Hub）：`memory`

## 1. 發佈前檢查

```sh
cd /Users/kyle/Documents/deepseek/dsh-plugins/dsh-agent-memory
npm test                 # 全部測試（Node only，無需網路）
npm pack --dry-run       # 檢查打包內容（版本、檔案清單）
git status               # 確認沒有漏 commit
```

`package.json` 已設 `"publishConfig": { "access": "public" }`，scoped 套件才會公開。

## 2. 發佈到 npm

```sh
npm login                # 用帳號 kyle2241345145351324321 登入（只需一次）
npm publish              # 或 npm publish --dry-run 先看會上傳什麼
npm view @kylefu/dsh-agent-memory version
```

之後升版流程：

```sh
npm version patch|minor|major   # 同步改 package.json + git tag
git push && git push --tags
npm publish
```

> 發佈後 72 小時內仍可用 `npm unpublish <name>@<version>` 撤銷；之後只能發新版本。

## 3. 驗證「從 npm 安裝」真的可用

在乾淨的 profile（或自己的）安裝：

```sh
dsh plugin --profile web add @kylefu/dsh-agent-memory
```

外掛宣告了 `dsh.bundle.patch`，安裝時會自動把 loader row 插進 profile；Host 端程式碼需要
重開一次 `dsh web`，Client 端重新整理頁面即可。確認：

- `Settings → Memory` 出現，Global / Project 兩頁可讀寫。
- `dsh-agent-memory` 的 `memory` 工具在對話中可用。
- 記憶檔在 `~/.dsh/memory/global.json` 與 `<workspace>/.dsh/memory.json`。

## 4. 建立 GitHub repo 並推上去

```sh
cd /Users/kyle/Documents/deepseek/dsh-plugins/dsh-agent-memory
git init
git add .
git commit -m "feat: initial release (v0.1.0)"
gh repo create kyle2241345145351324321/dsh-agent-memory --public --source=. --remote=origin --push
git tag v0.1.0 && git push --tags
```

## 5. 送交 DSH Plugin Hub

提交頁：<https://dsh-plugin.org/zh/submit>（English：<https://dsh-plugin.org/submit>）

可沿用的資料：

| 欄位 | 值 |
| --- | --- |
| 名稱 | `dsh-agent-memory` |
| npm 套件 | `@kylefu/dsh-agent-memory` |
| GitHub repo | `kyle2241345145351324321/dsh-agent-memory` |
| 分類 | `memory` |
| 一句話 | Durable agent memory for DeepSeek Harness: global + per-project memories, written by the agent and fully editable in Settings → Memory. |
| 安裝指令 | `dsh plugin --profile web add @kylefu/dsh-agent-memory` |
| GitHub 安裝 | `dsh plugin --profile web add github:kyle2241345145351324321/dsh-agent-memory` |
| 標籤 | `dsh`, `dsh-plugin`, `deepseek-harness`, `memory`, `agent-memory`, `claude`, `persistent-memory` |
| 特色 | Global memory across projects · Per-project memory in the repo · Agent `memory` tool · Settings → Memory CRUD UI · Plain JSON, no cloud |

送審後 Hub 會人工核驗；核驗通過才會出現在「記憶與上下文」分類。第一次送審前建議：

- repo 有 README、LICENSE、icon、截圖（本套件已附 `icon.svg`、`preview/*.png`）。
- 版本與 `CHANGELOG.md` 一致。
- `npm test` 綠燈、`npm pack --dry-run` 的內容等於 repo 內容。

## 6. 之後的版本

1. 改 `CHANGELOG.md` 的 Unreleased。
2. `npm version patch`（自動 commit + tag）。
3. `git push --tags` + `npm publish`。
4. Hub 會在數小時內抓到新版本（目錄每天更新）。

## Hub 目錄資料（送審用，欄位名稱依 Hub API）

```json
{
  "s": "dsh-agent-memory",
  "o": "kyle2241345145351324321",
  "n": "@kylefu/dsh-agent-memory",
  "vr": "v0.1.0",
  "c": "memory",
  "t": ["dsh", "dsh-plugin", "deepseek-harness", "memory", "agent-memory", "claude", "persistent-memory"],
  "f": [
    "Global memory across every project",
    "Per-project memory stored inside the workspace",
    "Agent writes through the memory tool",
    "Settings → Memory page: add / edit / disable / delete",
    "Plain JSON, hand-editable, no cloud"
  ],
  "d": "Durable agent memory for DeepSeek Harness — global facts about you plus per-project memory, saved by the agent and fully visible/editable in Settings → Memory.",
  "r": { "repo": "kyle2241345145351324321/dsh-agent-memory", "npmPackage": "@kylefu/dsh-agent-memory" },
  "ic": "dsh plugin --profile web add @kylefu/dsh-agent-memory",
  "igc": "dsh plugin --profile web add github:kyle2241345145351324321/dsh-agent-memory"
}
```
