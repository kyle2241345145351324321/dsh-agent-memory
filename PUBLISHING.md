# 發佈手冊（npm + DSH Plugin Hub）

套件名稱：`@kylefu/dsh-agent-memory`（npm 帳號 `kylefu`）
GitHub：`https://github.com/kyle2241345145351324321/dsh-agent-memory`
分類（Hub）：`memory`
現況：**0.1.0 已發佈**（2026-11-12）· Hub submission：#757

## 1. 發佈前檢查

```sh
cd /Users/kyle/Documents/deepseek/dsh-plugins/dsh-agent-memory
npm test                 # 全部測試（Node only，無需網路）
npm pack --dry-run       # 檢查打包內容（版本、檔案清單）
git status               # 確認沒有漏 commit
```

`package.json` 已設 `"publishConfig": { "access": "public" }`，scoped 套件才會公開。

## 2. 發佈到 npm

這個 npm 帳號啟用了 2FA，`npm publish` 必須帶 OTP，或使用開好「Bypass 2FA」權限的
granular access token（直接 `npm publish` 會得到 `E403 … 2FA required`）。

```sh
# 帳號 kylefu（npm whoami 可確認）
npm login                                    # 只需一次

# A. 有 OTP：在驗證碼還有效時發佈
npm publish --otp=<6 位驗證碼>

# B. 用 bypass-2FA token（之後要代發版本時方便；token 只放本機 npmrc，不要進 repo）
printf '//registry.npmjs.org/:_authToken=%s\n' '<TOKEN>' > /tmp/publish-npmrc
chmod 600 /tmp/publish-npmrc
npm publish --userconfig /tmp/publish-npmrc
rm -f /tmp/publish-npmrc
```

發佈成功不等於立刻查得到：registry 複製有延遲，`npm view` 可能先回 404（CLI 也會記住 404 快取）。
用 `npm view @kylefu/dsh-agent-memory version --prefer-online` 或直接 curl
`https://registry.npmjs.org/@kylefu%2Fdsh-agent-memory` 確認。

之後升版流程：

```sh
npm version patch|minor|major   # 同步改 package.json + git tag
git push && git push --tags
npm publish
```

> 發佈後 72 小時內仍可用 `npm unpublish <name>@<version>` 撤銷；之後只能發新版本。

## 3. 驗證「從 npm 安裝」真的可用

在乾淨的 profile 安裝（HUB 送審要求真的跑過）：

```sh
dsh plugin --profile memcheck add @kylefu/dsh-agent-memory
```

0.1.0 實測結果：

- pnpm 安裝成功，`node_modules/@kylefu/dsh-agent-memory` 內容完整（`lib/`、`client/`、`icon.svg`、`cordis.patch.yml`）。
- profile 的 `dsh.profile.bundles` 自動變成 `['@deepseek-ai/dsh-base', '@kylefu/dsh-agent-memory']`。
- 安裝後的 bundle patch 使用 scoped 名稱：`name: '@kylefu/dsh-agent-memory'`。
- 驗證用的 `memcheck` profile 已刪除。

外掛宣告了 `dsh.bundle.patch`，安裝時會自動把 loader row 插進 profile；Host 端程式碼需要
重開一次 `dsh web`，Client 端重新整理頁面即可。確認：

- `Settings → Memory` 出現，Global / Project 兩頁可讀寫。
- `dsh-agent-memory` 的 `memory` 工具在對話中可用。
- 記憶檔在 `~/.dsh/memory/global.json` 與 `<workspace>/.dsh/memory.json`。

> 注意：如果 profile 裡已經有「手動加的同一 id loader row」（例如本機開發的 `link:` 安裝），
> 要先移除那個 `- insert:` row 再從 npm 安裝，否則會 duplicate loader id。

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
本次已用 GitHub issue 形式送出：<https://github.com/dshplugin/dsh-plugin-hub/issues/757>
（Hub 的 `plugin_submission.yml` 模板明確說明：repo 要有 `dsh-plugin` topic、分類要用既有 key、
`package.json.repository` 要對應同一個 owner/repo——這三項都已符合。）

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
