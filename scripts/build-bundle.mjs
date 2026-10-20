#!/usr/bin/env node
/**
 * 把 Traderie 腳本需要的字典打包成「單一檔案」，並在打包前驗證資料品質。
 *
 *   node scripts/build-bundle.mjs           驗證並產生 d2r-translation-data/dist/traderie.bundle.json
 *   node scripts/build-bundle.mjs --check   只驗證 + 確認 bundle 是最新的（CI / PR 使用，不寫檔）
 *
 * 來源（人類編輯這些）：
 *   item/items.json · Platform/tr_affixes.json · Platform/tr_ui.json · Platform/tr_changelog.json
 * 產物（機器產生，請勿手動編輯）：
 *   dist/traderie.bundle.json   → 腳本只需載入這一份
 *
 * 輸出是決定性的（不含時間戳），資料沒變就不會產生多餘的 commit。
 * 只用 Node 內建模組，Node >= 18。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'd2r-translation-data');
const SRC = {
  items:     join(ROOT, 'item', 'items.json'),
  affixes:   join(ROOT, 'Platform', 'tr_affixes.json'),
  ui:        join(ROOT, 'Platform', 'tr_ui.json'),
  changelog: join(ROOT, 'Platform', 'tr_changelog.json'),
};
const OUT = join(ROOT, 'dist', 'traderie.bundle.json');
const SCHEMA = 1;                       // 與腳本內 BUNDLE_SCHEMA 對應；格式不相容時才遞增
const CHECK_ONLY = process.argv.includes('--check');

// 刻意允許「譯文為空白」的 UI 鍵（用來把某段英文從畫面上抹掉）
const ALLOW_BLANK_VALUE = new Set(['Diablo II: Resurrected']);
// 刻意帶前後空白的鍵（用於片段比對，例如 "Request to Start A Chat with "）會以警告提示，不算錯誤

const PLACEHOLDER = /\{\{(?:value|level|charges|duration)\}\}/g;
const errors = [];
const warnings = [];
const err  = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

/** JSON.parse 遇到重複鍵會「靜默採用最後一個」，所以對扁平 {key: "value"} 檔案另外掃一次 */
function findDuplicateKeys(text) {
  const seen = new Map(), dups = [];
  const re = /"((?:[^"\\]|\\.)*)"\s*:\s*"(?:[^"\\]|\\.)*"/g;
  let m;
  while ((m = re.exec(text))) {
    const key = JSON.parse(`"${m[1]}"`);
    if (seen.has(key)) dups.push(key); else seen.set(key, true);
  }
  return dups;
}

function loadFlat(name, path) {
  const text = readFileSync(path, 'utf8');
  let obj;
  try { obj = JSON.parse(text); } catch (e) { err(`${name}: JSON 語法錯誤 — ${e.message}`); return {}; }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) { err(`${name}: 必須是 {英文: 中文} 物件`); return {}; }
  for (const k of findDuplicateKeys(text)) err(`${name}: 重複的鍵 "${k}"（後者會靜默覆蓋前者）`);
  return obj;
}

function validateFlat(name, obj, { affix = false } = {}) {
  const lower = new Map();
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v !== 'string') { err(`${name}: "${k}" 的值不是字串`); continue; }
    if (!k.trim()) err(`${name}: 出現空白的鍵`);
    if (!v.trim() && !ALLOW_BLANK_VALUE.has(k)) err(`${name}: "${k}" 的譯文是空的`);
    if (k !== k.trim()) warn(`${name}: 鍵 "${k}" 前後有空白（若是刻意的片段比對可忽略）`);
    if (v.trim() && !/[\u4e00-\u9fff]/.test(v) && k.trim().toLowerCase() !== v.trim().toLowerCase())
      warn(`${name}: "${k}" 的譯文不含中文："${v}"`);
    const lk = k.toLowerCase();
    if (lower.has(lk) && lower.get(lk) !== k) warn(`${name}: "${k}" 與 "${lower.get(lk)}" 只差大小寫（比對不分大小寫，其一多餘）`);
    else lower.set(lk, k);
    if (affix) {
      const a = (k.match(PLACEHOLDER) || []).map(s => s.toLowerCase());
      const b = (v.match(PLACEHOLDER) || []).map(s => s.toLowerCase());
      // 譯文使用的占位符必須都存在於英文（數量可較少，例如 "(X/X Charges)" 只取一次）
      for (const p of new Set(b)) if (!a.includes(p)) err(`${name}: "${k}" 的譯文使用了英文沒有的占位符 ${p}`);
      for (const p of new Set(a)) if (!b.includes(p) && !/charges/i.test(k)) warn(`${name}: "${k}" 的譯文沒有用到占位符 ${p}`);
      try {
        const esc = k.split(PLACEHOLDER).map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('([\\d.,+\\-]+)');
        new RegExp(esc, 'gi');
      } catch (e) { err(`${name}: "${k}" 無法編譯成正則 — ${e.message}`); }
    }
  }
}

function checkItemCollisions(items) {
  const byZh = new Map();
  for (const [en, zh] of Object.entries(items)) {
    const c = zh.replace(/\(.*?\)/g, '').trim();
    if (!byZh.has(c)) byZh.set(c, []);
    byZh.get(c).push(en);
  }
  for (const [zh, ens] of byZh) if (ens.length > 1) warn(`items: 「${zh}」同時對應多個道具：${ens.join(' / ')}（搜尋會全部列出，但顯示上無法區分）`);
}

function validateChangelog(cl) {
  if (!cl || !Array.isArray(cl.versions) || !cl.versions.length) return err('changelog: 缺少 versions 陣列');
  if (cl.latest !== cl.versions[0].version) err(`changelog: latest(${cl.latest}) 必須等於 versions[0].version(${cl.versions[0].version})`);
  const seen = new Set();
  for (const v of cl.versions) {
    if (!v.version || !v.title || !v.content) err(`changelog: 版本項目缺少 version/title/content：${JSON.stringify(v).slice(0, 60)}`);
    if (seen.has(v.version)) err(`changelog: 版本號重複 ${v.version}`);
    seen.add(v.version);
  }
}

// ── 讀取 + 驗證 ───────────────────────────────────────────────────────────
const items   = loadFlat('items.json', SRC.items);
const affixes = loadFlat('tr_affixes.json', SRC.affixes);
const ui      = loadFlat('tr_ui.json', SRC.ui);
let changelog = null;
try { changelog = JSON.parse(readFileSync(SRC.changelog, 'utf8')); } catch (e) { err(`tr_changelog.json: ${e.message}`); }

validateFlat('items.json', items);
validateFlat('tr_affixes.json', affixes, { affix: true });
validateFlat('tr_ui.json', ui);
checkItemCollisions(items);
validateChangelog(changelog);

for (const w of warnings) console.warn('⚠️  ' + w);
if (errors.length) {
  for (const e of errors) console.error('❌ ' + e);
  console.error(`\n驗證失敗：${errors.length} 個錯誤、${warnings.length} 個警告`);
  process.exit(1);
}

// ── 打包 ──────────────────────────────────────────────────────────────────
// hash 只由「字典內容」決定（不含 changelog），讓腳本據此判斷快取是否需要更新
const hash = createHash('sha256').update(JSON.stringify({ items, affixes, ui })).digest('hex').slice(0, 12);
const bundle = { schema: SCHEMA, hash, counts: { items: Object.keys(items).length, affixes: Object.keys(affixes).length, ui: Object.keys(ui).length }, items, affixes, ui, changelog };
const output = JSON.stringify(bundle) + '\n';           // 壓縮輸出：縮小下載體積

const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : null;
const upToDate = current === output;

if (CHECK_ONLY) {
  if (!upToDate) { console.error('❌ dist/traderie.bundle.json 不是最新的，請執行：node scripts/build-bundle.mjs'); process.exit(1); }
  console.log(`✅ 驗證通過，bundle 為最新（hash ${hash}）`);
} else if (upToDate) {
  console.log(`✅ 驗證通過，bundle 無變動（hash ${hash}）`);
} else {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, output);
  console.log(`✅ 已產生 dist/traderie.bundle.json  ${(Buffer.byteLength(output) / 1024).toFixed(1)} KB  hash ${hash}`);
}
console.log(`   items ${bundle.counts.items} · affixes ${bundle.counts.affixes} · ui ${bundle.counts.ui} · 警告 ${warnings.length}`);
