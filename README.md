# D2R-storehouse

**暗黑破壞神 2 重製版（Diablo II: Resurrected）繁體中文翻譯資源庫**

本倉庫分為兩個部分：**通用翻譯資料**與**平台專用腳本**。
資料層與腳本層分離，方便未來將同一份字典套用到其他平台。

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

## 安裝方式

> 只需安裝**載入器**，之後所有更新自動套用。

### 1. 安裝 Tampermonkey

| 平台 | 連結 |
|------|------|
| Chrome / Edge | [Tampermonkey - Chrome Web Store](https://www.tampermonkey.net/) |
| Firefox | [Tampermonkey - Firefox Add-ons](https://www.tampermonkey.net/) |
| iOS Safari | [Userscripts App](https://apps.apple.com/app/userscripts/id1463298887) |

### 2. 安裝載入器

點擊下方連結，在 Tampermonkey 確認安裝：

**[💻 安裝 D2R Traderie 中文翻譯](https://greasyfork.org/zh-CN/scripts/570784-traderie-d2r-chinese-translator-supports-cn-search)**

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

## 問題回報

遇使用BUG請至 [Issues](https://github.com/awdrrawd/D2R-storehouse/issues) 回報。
由於文本量過大，翻譯問題原則上短時間不修
