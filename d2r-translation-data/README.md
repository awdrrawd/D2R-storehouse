# D2R 繁體中文翻譯字典（通用資料層）

與平台無關的 *Diablo II: Resurrected* 繁體中文字典，純 JSON，授權為 [MIT](LICENSE)，**歡迎其他網站與專案直接使用**。

---

## 檔案與用途

| 檔案 | 層級 | 格式 | 說明 |
|------|------|------|------|
| `item/items.json` | 通用 | `{ "English": "中文" }` | 道具、符文、符文之語、套裝、獨特裝備、技能名稱 |
| `Platform/tr_affixes.json` | 通用 | `{ "模板": "模板" }` | 屬性詞綴；含占位符，見下方。檔名帶 `tr_` 是歷史原因，**內容是遊戲通用文字，不是 Traderie 專屬** |
| `Platform/tr_ui.json` | 平台（Traderie） | `{ "English": "中文" }` | 僅限 Traderie 網站的介面文字 |
| `Platform/tr_changelog.json` | 平台（Traderie） | 物件 | 腳本內顯示的更新歷程 |
| `platforms.json` | 設定 | 物件 | 打包設定：通用層來源、顯示格式、各平台的 UI 來源與輸出位置 |

> ⚠️ 這些檔案的路徑已被已發布的腳本直接引用，**請勿搬動或改名**。

---

## 資料約定

1. **字典資料保持乾淨**：譯文只放中文，不含「(English)」。要不要顯示英文由使用端決定（見「顯示格式」）。
2. **比對不分大小寫**（以英文為鍵）。
3. **英文比對應以單字邊界為準**，並**由長到短**比對，避免 `Sword` 先吃掉 `Long Sword` 的一部分。
4. 少數 UI 鍵刻意帶前後空白，用來比對被網站拆成兩段的句子片段（例如 `"Request to Start A Chat with "`），請勿 trim。
5. 譯文為空白的鍵（例如 `Diablo II: Resurrected`）代表「刻意抹掉這段文字」。

### 詞綴占位符

`tr_affixes.json` 的鍵與值可以含這四種占位符：`{{value}}` `{{level}}` `{{charges}}` `{{duration}}`

- 英文鍵中的每個占位符，用一個「數字或範圍」的捕獲群組比對，例如 `[\d.,+\-]+`，範圍如 `1-5`、`10 ~ 20` 也要吃得下。
- **占位符依「出現順序」對應，名稱只是標籤**：譯文第 N 個占位符 = 英文第 N 個捕獲到的數字。因此譯文的順序必須與英文一致（`build-bundle.mjs` 會驗證）。
- 譯文可以比英文少用占位符（例如英文的 `({{charges}}/{{charges}} Charges)` 譯文只需取一次）。

範例：

```json
"+{{value}} To All Skills": "+{{value}} 所有技能"
```

`+2 To All Skills` → `+2 所有技能`

### 顯示格式（`display`）

本專案在 Traderie 採用的顯示約定如下，記錄在 `platforms.json` 與每份 bundle 的 `meta.display`：

| 區塊 | 格式 | 結果 |
|------|------|------|
| `items` | `zh(en)` | `諧角之冠(Harlequin Crest)` |
| `affixes` | `zh` | `+2 所有技能` |
| `ui` | `zh` | `登出` |

這只是**預設建議**。你的網站可以自行選擇 `items` 純中文或中英並列。

---

## 單檔 bundle（建議其他網站使用）

不想自己合併多份 JSON 的話，可以直接用每個平台的 bundle：

```
{
  "schema": 1,                       // bundle 欄位版本
  "hash": "b354753c5793",            // 字典內容雜湊（可用於快取判斷）
  "meta": { "platform": "traderie", "license": "MIT", "display": {...}, "counts": {...} },
  "items":   { "English": "中文", ... },
  "affixes": { "模板": "模板", ... },
  "ui":      { "English": "中文", ... },
  "changelog": { ... }               // 可選
}
```

- 三個區塊**分開存放、不攤平**：因為它們的比對方式與顯示格式都不同（道具是整詞比對、詞綴是帶占位符的規則、UI 是句子片段）。
- Traderie 的 bundle：`../d2r-traderie-translation/traderie.bundle.json`
- bundle 由 CI 自動產生，請勿手動編輯；來源有變動時會自動更新。

---

## 新增一個平台

1. 新增該平台的 UI 字典，例如 `Platform/<name>_ui.json`（格式同 `tr_ui.json`）。
2. 在 `platforms.json` 的 `platforms` 陣列加一筆：

   ```json
   { "id": "<name>", "ui": "Platform/<name>_ui.json", "out": "<資料夾>/<name>.bundle.json" }
   ```

   `out` 必須在倉庫內且檔名以 `.bundle.json` 結尾（CI 靠這個樣式自動 commit）。`changelog`、`allowBlankUi` 為選填。
3. 推送後 CI 會自動驗證並產生 `<name>.bundle.json`（內容 = 通用的道具與詞綴 + 該平台 UI）。
4. 本機可先執行 `node scripts/build-bundle.mjs` 預覽；它會驗證重複鍵、空白譯文、占位符順序、詞綴能否編譯成正則等。

---

## 授權

本目錄所有字典資料依 [MIT](LICENSE) 授權。遊戲內容與名稱屬 Blizzard Entertainment 所有。
