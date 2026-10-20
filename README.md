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
├── d2r-translation-data/               # 通用翻譯資料（純 JSON，各平台共用）【人工維護】
│   ├── item/
│   │   ├── items.js                    # 原始道具字典（window.D2R_ITEMS，保留）
│   │   ├── affixes.js                  # 原始屬性詞綴字典（window.D2R_AFFIXES，正則格式，保留）
│   │   └── items.json                  # 道具字典 — TR 特化版
│   ├── Platform/
│   │   ├── tr_affixes.json             # 屬性詞綴字典 — TR 特化版（正則改為 {{value}} 等占位符）
│   │   ├── tr_ui.json                  # Traderie 平台介面翻譯
│   │   └── tr_changelog.json           # 更新歷程（腳本內「📋 更新」顯示）
│   ├── platforms.json                  # 打包設定（顯示格式、各平台的 UI 來源與輸出位置）
│   ├── README.md                       # 字典格式說明（給其他網站／專案的整合者）
│   └── LICENSE                         # 字典授權：MIT
│
├── d2r-traderie-translation/           # Traderie 平台腳本
│   ├── D2r_traderie_translation_main.user.js        # 主體腳本（Greasy Fork 發佈的就是這份）
│   ├── D2r traderie translate cn loader.user.js     # 進階：GitHub 載入器（選用）
│   ├── traderie.bundle.json            # ⚙️ 自動產生：通用字典 + Traderie UI + 更新歷程，合成單一檔案
│   └── LICENSE                         # 腳本授權：CC BY-ND 4.0
│
├── scripts/build-bundle.mjs            # 驗證字典並打包（Node 18+，無外部依賴）
├── .github/workflows/build-bundle.yml  # 字典有變動時：驗證 → 打包 → commit → 部署到 GitHub Pages
├── other/                              # 其他獨立的小腳本（與 Traderie 翻譯無關）
└── LICENSE.md                          # 授權總覽
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
| 字典資料 | 每次開頁面載入單一打包檔 `traderie.bundle.json`，來源依序為 **GitHub Pages → raw.githubusercontent.com → jsDelivr → 本機快取**（前者失敗才改用後者；離線或 GitHub 異常時仍可用上次的快取）。修改原始字典後由 CI 自動打包並部署，通常數分鐘內生效 |

---

## 翻譯資料說明

字典分為「**原始字典**」與「**TR 特化版**」：

- **原始字典**（`item/items.js`、`item/affixes.js`）保留不動，作為日後擴充與其他專案的起點；不參與打包，也不會自動與 JSON 同步。
- **TR 特化版**（`items.json`、`tr_affixes.json`、`tr_ui.json`）是腳本與 CI 實際使用的純 JSON，授權 MIT，其他網站或專案也可直接使用。
**完整的格式約定、占位符規則、如何新增平台，請見 [`d2r-translation-data/README.md`](d2r-translation-data/README.md)。**

| 檔案 | 內容 | 規模 |
|------|------|------|
| `item/items.json` | 道具、符文、符文之語、套裝、獨特裝備、技能名稱 | 約 1,500 條 |
| `Platform/tr_affixes.json` | 屬性詞綴（來源：[d2r.world](https://d2r.world) EN/ZH 配對） | 約 630 條 |
| `Platform/tr_ui.json` | Traderie 介面文字 | 約 630 條 |

**單檔 bundle**：`d2r-traderie-translation/traderie.bundle.json` 由 CI 把以上字典合併成一份，三個區塊（`items` / `affixes` / `ui`）**分開存放、不攤平**，並在 `meta.display` 記錄顯示約定：

| 區塊 | 顯示 | 範例 |
|------|------|------|
| 道具 `items` | 中文(English) | `諧角之冠(Harlequin Crest)` |
| 詞綴 `affixes` | 純中文 | `+2 所有技能` |
| 平台介面 `ui` | 純中文 | `登出` |

字典資料本身只放中文，不含括號英文；顯示格式由使用端依 `meta.display` 決定。

---

## 參與維護字典

1. 只編輯 `d2r-translation-data/` 底下的原始 JSON（`item/items.json`、`Platform/tr_affixes.json`、`Platform/tr_ui.json`，發版時加上 `tr_changelog.json`），**不要**手動改任何 `*.bundle.json`。
2. 本機可先驗證 + 打包：

   ```bash
   node scripts/build-bundle.mjs          # 驗證並產生所有平台的 bundle
   node scripts/build-bundle.mjs --check  # 只驗證，並確認 bundle 是最新的（不寫檔）
   ```

3. 驗證會檢查：JSON 語法、**重複的鍵**（`JSON.parse` 會靜默覆蓋，所以另外掃描）、空白譯文、詞綴占位符的**順序是否與英文一致**、詞綴能否編譯成正則、更新日誌格式；並警告大小寫重複、前後空白、同名道具。
4. 推送到 `main` 後，GitHub Actions 會自動驗證、在 bundle 有變動時 commit 更新，並把 bundle 與主體腳本**部署到 GitHub Pages**；Pull Request 則只做驗證與「bundle 是否最新」檢查。

> **維護者一次性設定**：Settings → Pages → Build and deployment → Source 選 **GitHub Actions**。
> 部署內容：`https://awdrrawd.github.io/D2R-storehouse/` 下的 `traderie.bundle.json`、`D2r_traderie_translation_main.user.js` 與一個索引頁。

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

本倉庫依內容分為兩種授權，詳見 [LICENSE.md](LICENSE.md)：

- **翻譯字典資料**（`d2r-translation-data/` 及由它自動產生的 `*.bundle.json`）：[MIT](d2r-translation-data/LICENSE)，可自由使用、修改、整合到其他網站或專案。
- **其餘內容**（使用者腳本、建置腳本等）：[CC BY-ND 4.0](https://creativecommons.org/licenses/by-nd/4.0/)。
  - **分享** — 以任何媒介或格式重製及散布
  - **姓名標示** — 須適當標示原作者（likolisu）及來源連結
  - **禁止改作** — 不得修改、重混或基於本內容建立衍生著作後再行散布

> 簡單來說：字典可以自由使用；腳本可以轉載或分享，但**不可修改後重新發布**。若有合作或特殊授權需求，請透過 Issues 聯繫。

---

- **Diablo II: Resurrected** 及其所有遊戲內容、名稱、圖像均為 **Blizzard Entertainment** 之財產，本專案與 Blizzard 無任何官方關聯。
- **Traderie** 平台及其介面為 Traderie 所有，本專案僅為使用者端的非官方在地化工具，不修改平台本身。
