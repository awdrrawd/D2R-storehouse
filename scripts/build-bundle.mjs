#!/usr/bin/env node
/**
 * 依 d2r-translation-data/platforms.json 為每個平台產生「單一檔案字典」，並在打包前驗證資料品質。
 *
 *   node scripts/build-bundle.mjs           驗證並產生所有平台的 *.bundle.json
 *   node scripts/build-bundle.mjs --check   只驗證，並確認所有 bundle 都是最新的（CI / PR 使用，不寫檔）
 *
 * 來源（人類編輯這些，路徑為既有契約，請勿搬動或改名）：
 *   通用層：item/items.json · Platform/tr_affixes.json          （與平台無關的遊戲文字）
 *   平台層：各平台自己的 UI 字典與更新日誌（見 platforms.json）
 * 產物（機器產生，請勿手動編輯）：
 *   platforms.json 中每個平台的 `out`，內容 = 通用層 + 該平台的 UI + changelog，分區存放
 *
 * 輸出是決定性的（不含時間戳），資料沒變就不會產生多餘的 commit。只用 Node 內建模組，Node >= 18。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(REPO, 'd2r-translation-data');
const SCHEMA = 1;                       // bundle 頂層欄位（items/affixes/ui/changelog）的版本；只加欄位不需遞增
const CHECK_ONLY = process.argv.includes('--check');
const DISPLAY_FORMATS = new Set(['zh', 'zh(en)']);

const errors = [], warnings = [];
let scope = '';
const err  = (m) => errors.push(`${scope}${m}`);
const warn = (m) => warnings.push(`${scope}${m}`);

// 詞綴占位符：依「出現順序」對應腳本捕獲到的數字（名稱只是標籤），所以譯文的順序必須與英文一致
const PLACEHOLDER = /\{\{(?:value|level|charges|duration)\}\}/g;

/** JSON.parse 遇到重複鍵會「靜默採用最後一個」，所以對扁平 {key: "value"} 檔案另外掃一次 */
function findDuplicateKeys(text) {
  const seen = new Set(), dups = [];
  const re = /"((?:[^"\\]|\\.)*)"\s*:\s*"(?:[^"\\]|\\.)*"/g;
  let m;
  while ((m = re.exec(text))) {
    const key = JSON.parse(`"${m[1]}"`);
    if (seen.has(key)) dups.push(key); else seen.add(key);
  }
  return dups;
}

function loadFlat(name, rel) {
  const path = join(DATA, rel);
  if (!existsSync(path)) { err(`${name}: 找不到檔案 ${rel}`); return {}; }
  const text = readFileSync(path, 'utf8');
  let obj;
  try { obj = JSON.parse(text); } catch (e) { err(`${name}: JSON 語法錯誤 — ${e.message}`); return {}; }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) { err(`${name}: 必須是 {英文: 中文} 物件`); return {}; }
  for (const k of findDuplicateKeys(text)) err(`${name}: 重複的鍵 "${k}"（後者會靜默覆蓋前者）`);
  return obj;
}

function validateFlat(name, obj, { affix = false, allowBlank = [] } = {}) {
  const lower = new Map();
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v !== 'string') { err(`${name}: "${k}" 的值不是字串`); continue; }
    if (!k.trim()) err(`${name}: 出現空白的鍵`);
    if (!v.trim() && !allowBlank.includes(k)) err(`${name}: "${k}" 的譯文是空的`);
    if (k !== k.trim()) warn(`${name}: 鍵 "${k}" 前後有空白（若是刻意的片段比對可忽略）`);
    if (v.trim() && !/[\u4e00-\u9fff]/.test(v) && k.trim().toLowerCase() !== v.trim().toLowerCase())
      warn(`${name}: "${k}" 的譯文不含中文："${v}"`);
    const lk = k.toLowerCase();
    if (lower.has(lk) && lower.get(lk) !== k) warn(`${name}: "${k}" 與 "${lower.get(lk)}" 只差大小寫（比對不分大小寫，其一多餘）`);
    else lower.set(lk, k);
    if (affix) {
      const en = k.match(PLACEHOLDER) || [], zh = v.match(PLACEHOLDER) || [];
      // 位置對應：譯文第 i 個占位符對應英文第 i 個；譯文可以少（例如 "(X/X Charges)" 只取一次），但不能多、不能換順序
      if (zh.length > en.length) err(`${name}: "${k}" 的譯文占位符比英文多`);
      else zh.forEach((p, i) => { if (p !== en[i]) err(`${name}: "${k}" 第 ${i + 1} 個占位符應為 ${en[i]}，譯文是 ${p}（順序必須與英文一致，否則數字會填錯位置）`); });
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

// ── 讀取設定 ──────────────────────────────────────────────────────────────
let manifest;
try { manifest = JSON.parse(readFileSync(join(DATA, 'platforms.json'), 'utf8')); }
catch (e) { console.error('❌ 無法讀取 d2r-translation-data/platforms.json：' + e.message); process.exit(1); }

const display = manifest.display || {};
for (const k of ['items', 'affixes', 'ui']) if (!DISPLAY_FORMATS.has(display[k])) err(`platforms.json: display.${k} 必須是 ${[...DISPLAY_FORMATS].join(' 或 ')}`);
if (!Array.isArray(manifest.platforms) || !manifest.platforms.length) err('platforms.json: 缺少 platforms 陣列');

// ── 通用層（只驗證一次）──────────────────────────────────────────────────
scope = '[core] ';
const items   = loadFlat('items', manifest.core?.items   || '');
const affixes = loadFlat('affixes', manifest.core?.affixes || '');
validateFlat('items', items);
validateFlat('affixes', affixes, { affix: true });
checkItemCollisions(items);

// ── 各平台 ────────────────────────────────────────────────────────────────
const jobs = [];
const seenIds = new Set(), seenOut = new Set();
for (const p of manifest.platforms || []) {
  scope = `[${p.id || '?'}] `;
  if (!p.id || !/^[a-z0-9-]+$/.test(p.id)) { err('platform.id 必須是小寫英數與連字號'); continue; }
  if (seenIds.has(p.id)) { err('platform.id 重複'); continue; } seenIds.add(p.id);
  const out = resolve(REPO, p.out || '');
  const rel = relative(REPO, out);
  if (!p.out || rel.startsWith('..') || isAbsolute(rel) || !/\.bundle\.json$/.test(out)) { err(`out 必須在倉庫內且檔名以 .bundle.json 結尾（CI 靠這個樣式 commit）：${p.out}`); continue; }
  if (seenOut.has(out)) { err('out 與其他平台重複'); continue; } seenOut.add(out);

  const ui = loadFlat('ui', p.ui || '');
  validateFlat('ui', ui, { allowBlank: p.allowBlankUi || [] });
  let changelog = null;
  if (p.changelog) {
    try { changelog = JSON.parse(readFileSync(join(DATA, p.changelog), 'utf8')); validateChangelog(changelog); }
    catch (e) { err(`changelog: ${e.message}`); }
  }
  jobs.push({ p, out, ui, changelog });
}

scope = '';
for (const w of warnings) console.warn('⚠️  ' + w);
if (errors.length) {
  for (const e of errors) console.error('❌ ' + e);
  console.error(`\n驗證失敗：${errors.length} 個錯誤、${warnings.length} 個警告`);
  process.exit(1);
}

// ── 打包 ──────────────────────────────────────────────────────────────────
// hash 只由「字典內容與顯示設定」決定（不含 changelog），腳本與其他消費者可據此判斷快取是否需要更新
let stale = 0;
for (const { p, out, ui, changelog } of jobs) {
  const hash = createHash('sha256').update(JSON.stringify({ items, affixes, ui, display })).digest('hex').slice(0, 12);
  const bundle = {
    schema: SCHEMA,
    hash,
    meta: {
      platform: p.id,
      license: manifest.license || null,
      display,                                   // items 顯示「中文(English)」；affixes / ui 純中文。資料本身保持乾淨，格式由消費者決定
      counts: { items: Object.keys(items).length, affixes: Object.keys(affixes).length, ui: Object.keys(ui).length },
    },
    items, affixes, ui, changelog,
  };
  const output = JSON.stringify(bundle) + '\n';
  const rel = relative(REPO, out).replace(/\\/g, '/');
  const current = existsSync(out) ? readFileSync(out, 'utf8') : null;
  const kb = (Buffer.byteLength(output) / 1024).toFixed(1);

  if (current === output) console.log(`✅ [${p.id}] ${rel} 為最新（${kb} KB · hash ${hash}）`);
  else if (CHECK_ONLY) { stale++; console.error(`❌ [${p.id}] ${rel} 不是最新的，請執行：node scripts/build-bundle.mjs`); }
  else { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, output); console.log(`✅ [${p.id}] 已產生 ${rel}（${kb} KB · hash ${hash}）`); }
}
console.log(`   items ${Object.keys(items).length} · affixes ${Object.keys(affixes).length} · 警告 ${warnings.length}`);
if (stale) process.exit(1);
