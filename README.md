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
├── d2r-translation/            # 通用翻譯資料（各平台共用）
│   ├── item/
│   │   ├── items.js            # 道具、符文、技能名稱字典
│   │   └── affixes.js          # 屬性詞綴正則字典
│   └── Platform/
│       └── ui_traderie.js      # Traderie 平台介面翻譯
│
└── d2r-traderie-translation/   # Traderie 平台腳本
    ├── D2r_traderie_translation_main.user.js   # 主體腳本
    └── D2R_Traderie_CN_Loader.user.js          # 載入器（使用者安裝此檔）
```

---

## 功能特色

- 🀄 **全頁面繁體中文翻譯**：道具名稱、屬性詞綴、介面文字
- 🔍 **中文搜尋**：在 Search options / Search Stats / More Filters 欄位輸入中文，自動轉換為英文送出
- 📄 **頁碼跳轉**：在分頁列旁新增數字輸入框，直接跳轉任意頁
- 🔄 **自動更新**：透過載入器安裝，字典與腳本更新後**下次開頁面即生效**，無需重裝
- 📱 **iOS Safari 相容**：支援 Userscripts App

---

## 安裝方式（Traderie 平台中文化）

> 以下安裝步驟適用於 **Traderie D2R 交易平台**的中文化腳本。
> 只需安裝**載入器**，之後所有更新自動套用，無需重新安裝。

### 1. 安裝 Tampermonkey

| 平台 | 連結 |
|------|------|
| Chrome / Edge | [Tampermonkey - Chrome Web Store](https://www.tampermonkey.net/) |
| Firefox | [Tampermonkey - Firefox Add-ons](https://www.tampermonkey.net/) |
| iOS Safari | [Userscripts App](https://apps.apple.com/app/userscripts/id1463298887) |

### 2. 安裝 Traderie 中文化載入器

點擊下方連結，在 Tampermonkey 確認安裝：

**[💻 安裝 Traderie D2R 中文化腳本](https://greasyfork.org/zh-CN/scripts/570784-traderie-d2r-chinese-translator-supports-cn-search)**

安裝完成後，前往 [Traderie D2R](https://traderie.com/diablo2resurrected) 即可看到繁體中文介面。

---

## 更新說明

| 項目 | 更新方式 |
|------|---------|
| 載入器本身 | Tampermonkey 自動偵測版本，有更新時提示 |
| 主體腳本 | 每次開頁面自動從 GitHub 抓取最新版 |
| 字典資料 | 每次開頁面自動載入最新版，commit 後即時生效 |

---

## 翻譯資料說明

### `d2r-translation/item/items.js`
- 全域變數：`window.D2R_ITEMS`
- 內容：所有道具名稱、符文、符文之語、套裝、獨特裝備、技能名稱
- 顯示格式：`中文名(English Name)`

### `d2r-translation/item/affixes.js`
- 全域變數：`window.D2R_AFFIXES`
- 內容：屬性詞綴正則表達式對照表，來源為 [d2r.world](https://d2r.world) EN/ZH 頁面自動配對
- 格式：`[正則, 中文模板]`，`$1 $2...` 對應捕獲群組
- 包含：基礎屬性、技能加成、施法觸發、充能技能、抗性、傷害、依角色等級而定等 575+ 條

### `d2r-translation/Platform/ui_traderie.js`
- 全域變數：`window.D2R_UI_TRADERIC`
- 內容：Traderie 網站介面文字，包含導覽列、交易介面、設定頁面、通知、篩選器等 430+ 條

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
