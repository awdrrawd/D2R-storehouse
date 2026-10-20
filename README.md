# D2R-storehouse
**暗黑破壞神 2 重製版（Diablo II: Resurrected）繁體中文翻譯資源庫**

本倉庫分為兩個部分：**通用翻譯資料**與**平台專用腳本**。
資料層與腳本層分離，方便未來將同一份字典套用到其他平台。

> ⚠️ **目前翻譯腳本支援 [Traderie](https://traderie.com/diablo2resurrected) 平台。**

---

## 倉庫結構

```
D2R-storehouse/
│
├── d2r-translation-data/               # 通用翻譯資料（各平台共用，純 JSON）
│   ├── item/
│   │   └── items.json                  # 道具、符文、技能名稱字典
│   ├── Platform/
│   │   ├── tr_affixes.json             # 屬性詞綴字典（含 {{value}} 等占位符）
│   │   ├── tr_ui.json                  # Traderie 平台介面翻譯
│   │   └── tr_changelog.json           # 更新歷程（腳本內「📋 更新」顯示）
│   └── dist/
│       └── traderie.bundle.json        # ⚙️ 自動產生：上述四份打包成單一檔案（腳本只載入這一份）
│
├── d2r-traderie-translation/           # Traderie 平台腳本
│   ├── D2r_traderie_translation_main.user.js        # 主體腳本（Greasy Fork 發佈的就是這份）
│   └── D2r traderie translate cn loader.user.js     # 進階：GitHub 載入器（選用）
│
├── scripts/
│   └── build-bundle.mjs                # 驗證字典並打包（Node 18+，無外部依賴）
│
├── .github/workflows/
│   └── build-bundle.yml                # 字典有變動時自動驗證 + 重新打包
│
└── other/                              # 其他獨立的小腳本（與 Traderie 翻譯無關）
```

---

## 功能特色

- 📖 **全頁面繁體中文翻譯**：道具名稱、屬性詞綴、介面文字
- 🔍 **中文搜尋**：在 Search options / Search Stats / More Filters 等搜尋欄位輸入中文，自動轉換為英文送出（支援注音、拼音等輸入法選字）
- ✏️ **快速編輯**：在個人頁面的 列表 / 願望清單 內添加快速修改報價的按鈕
- 🔔 **清除通知**：在通知頁面中添加單筆刪除與全部刪除的快捷按鈕
- 🔊 **聊天音效**：視窗未在前景時有新訊息會播放提示音；可自行決定是否「音效後自動標為已讀」
- 🔄 **自動更新**：字典與腳本更新後下次開頁面即生效，字典離線時自動使用上次快取
- 📱 **支援手機**：在支援 Userscripts App 的手機瀏覽器上也能使用

---

## 安裝方式（Traderie 平台中文化）

### 1. 安裝使用者腳本管理器

| 平台 | 連結 |
|------|------|
| Chrome / Edge / Firefox | [Tampermonkey](https://www.tampermonkey.net/) |
| iOS Safari | [Userscripts App](https://apps.apple.com/app/userscripts/id1463298887) |

### 2. 安裝腳本（建議：Greasy Fork 主體版）

點擊下方連結，在 Tampermonkey 確認安裝：

**[💻 從 Greasy Fork 安裝「Traderie D2R Chinese Translator + Chinese search」](https://greasyfork.org/zh-TW/scripts/570784-traderie-d2r-chinese-translator-chinese-search)**

安裝完成後，前往 [Traderie D2R](https://traderie.com/diablo2resurrected) 即可看到繁體中文介面。

- 這是**單檔的主體腳本**，由 Greasy Fork 負責版本更新；字典則在每次開頁面時自動從 GitHub 載入最新版，不需要為了字典更新而重裝腳本。
- 進階使用者若希望「腳本本體」也直接跟著 GitHub `main` 分支走，可改裝 [載入器](https://github.com/awdrrawd/D2R-storehouse/raw/refs/heads/main/d2r-traderie-translation/D2r%20traderie%20translate%20cn%20loader.user.js)。
- ⚠️ **兩者請擇一安裝，不要同時安裝**（同時安裝時載入器會自動略過，但沒有必要）。

---

## 更新說明

| 項目 | 更新方式 |
|------|---------|
| 主體腳本（Greasy Fork 版） | Tampermonkey 依 Greasy Fork 的版本自動偵測並提示更新 |
| 主體腳本（載入器版） | 每次開頁面從 GitHub 抓取；失敗時使用上次成功的快取 |
| 字典資料 | 每次開頁面載入單一打包檔 `traderie.bundle.json`（網路優先；離線或 GitHub 異常時使用本機快取）。commit 後由 CI 重新打包，GitHub 的 raw 快取約數分鐘內生效 |

---

## 翻譯資料說明

所有字典皆為純 JSON，與平台無關，可直接用於其他專案。

### `d2r-translation-data/item/items.json`
- 格式：`{ "English Name": "中文名" }`
- 內容：所有道具名稱、符文、符文之語、套裝、獨特裝備、技能名稱（約 1,500 條）
- 顯示格式：`中文名(English Name)`

### `d2r-translation-data/Platform/tr_affixes.json`
- 格式：`{ "+{{value}} To All Skills": "+{{value}} 所有技能" }`
- 內容：屬性詞綴對照表，來源為 [d2r.world](https://d2r.world) EN/ZH 頁面自動配對（約 630 條）
- 占位符：`{{value}}`、`{{level}}`、`{{charges}}`、`{{duration}}`，會被轉成數字捕獲群組

### `d2r-translation-data/Platform/tr_ui.json`
- 格式：`{ "English UI text": "中文介面文字" }`
- 內容：Traderie 網站介面文字，包含導覽列、交易介面、設定頁面、通知、篩選器等（約 630 條）
- 比對**不分大小寫**；少數鍵刻意帶前後空白，用於比對被拆成兩段的句子片段

### `d2r-translation-data/dist/traderie.bundle.json`（自動產生，請勿手動編輯）
- 上面三份字典 + `tr_changelog.json` 合併成的單一檔案，腳本只需一次請求
- 內容為決定性輸出（不含時間戳）：資料沒變，檔案就不變
- 含 `schema`（格式版本）與 `hash`（字典內容雜湊，用於快取判斷）

---

## 參與維護字典

1. 只編輯 `item/items.json`、`Platform/tr_affixes.json`、`Platform/tr_ui.json`（以及發版時的 `tr_changelog.json`），**不要**手動改 `dist/`。
2. 本機可先驗證 + 打包：

   ```bash
   node scripts/build-bundle.mjs          # 驗證並產生 dist/traderie.bundle.json
   node scripts/build-bundle.mjs --check  # 只驗證，並確認 bundle 是最新的（不寫檔）
   ```

3. 驗證會檢查：JSON 語法、**重複的鍵**（`JSON.parse` 會靜默覆蓋，所以另外掃描）、空白譯文、詞綴占位符是否一致、詞綴能否編譯成正則、changelog 格式；以及警告大小寫重複、前後空白、同名道具。
4. 推送到 `main` 後，GitHub Actions 會自動驗證並在 bundle 有變動時 commit 更新；Pull Request 則只做驗證與「bundle 是否最新」檢查。

---

## 語言支援說明

| 語言 | 翻譯方式 |
|------|---------|
| 繁體中文 | 人工維護字典，為本專案主要翻譯語言 |
| 簡體中文 | 由繁體中文輸出透過 [OpenCC](https://github.com/BYVoid/OpenCC) 轉換，**未另行維護簡體字典** |

> 簡體中文的準確度取決於 OpenCC 的轉換品質，部分遊戲專有名詞與官方簡體版本有所差異。

---

## 問題回報

遇使用 BUG 請至 [Issues](https://github.com/awdrrawd/D2R-storehouse/issues) 回報。
由於文本量過大，翻譯問題原則上短時間不修正。

---

## 版權聲明

Copyright © 2024 awdrrawd.

本專案腳本與翻譯內容（字典、詞綴對照表、介面文字）依 [CC BY-ND 4.0](https://creativecommons.org/licenses/by-nd/4.0/) 授權釋出。

您可以自由：
- **分享** — 以任何媒介或格式重製及散布本專案內容

但須遵守以下條件：
- **姓名標示** — 須適當標示原作者（likolisu）及來源連結
- **禁止改作** — 不得修改、重混或基於本內容建立衍生著作後再行散布

> 簡單來說：可以轉載或分享，但**不可修改後重新發布**。若有合作或特殊授權需求，請透過 Issues 聯繫。

---

- **Diablo II: Resurrected** 及其所有遊戲內容、名稱、圖像均為 **Blizzard Entertainment** 之財產，本專案與 Blizzard 無任何官方關聯。
- **Traderie** 平台及其介面為 Traderie 所有，本專案僅為使用者端的非官方在地化工具，不修改平台本身。
