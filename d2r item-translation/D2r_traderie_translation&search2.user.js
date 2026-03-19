// ==UserScript==
// @name         D2R Traderie網中文翻譯 + 中文搜尋
// @namespace    https://github.com/awdrrawd/d2r-traderie-tw
// @version      1.6
// @description  將 traderie 的 D2R 頁面翻譯為繁體中文，並支援中文搜尋輸入（iOS Safari 相容版）
// @author       瀧月瀨
// @match        https://traderie.com/diablo2resurrected*
// @match        https://*.traderie.com/diablo2resurrected/*
// @icon         https://www.google.com/s2/favicons?domain=traderie.com&sz=64
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

(async function () {
  'use strict';

  // ── iOS 相容包裝：GM_ 函式不存在時 fallback 到 localStorage ──
  const PAGE = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

  function gmGet(key, def) {
    try { return GM_getValue(key, def); } catch (_) {
      try { const v = localStorage.getItem('d2r_' + key); return v !== null ? JSON.parse(v) : def; } catch (_) { return def; }
    }
  }
  function gmSet(key, val) {
    try { GM_setValue(key, val); } catch (_) {
      try { localStorage.setItem('d2r_' + key, JSON.stringify(val)); } catch (_) {}
    }
  }
  function gmStyle(css) {
    try { GM_addStyle(css); } catch (_) {
      const s = document.createElement('style');
      s.textContent = css;
      (document.head || document.documentElement).appendChild(s);
    }
  }

  // ── 資料載入：fetch + new Function() ──
  // fetch 在 iOS userscript 環境最穩定
  // new Function(code)() 在當前 window 執行，不受 <script> CSP 限制
  const FILE_PATHS = [
    'd2r item-translation/data/translations.js',
    'd2r item-translation/data/affixes.js',
  ];
  const REPO   = 'awdrrawd/D2R-storehouse';
  const BRANCH = 'main';

  const CDN_BASES = [
    `https://cdn.jsdelivr.net/gh/${REPO}@${BRANCH}/`,
    `https://raw.githubusercontent.com/${REPO}/refs/heads/${BRANCH}/`,
  ];

  async function fetchAndExec(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
    const code = await res.text();
    // new Function 在當前 window scope 執行，設定的變數會落在 PAGE 上
    try {
      new Function(code)();
    } catch (_) {
      // fallback：直接 eval（部分 iOS app 需要）
      // eslint-disable-next-line no-eval
      eval(code);
    }
  }

  async function loadWithFallback(filePath) {
    const encoded = encodeURIComponent(filePath);
    for (const base of CDN_BASES) {
      try {
        await fetchAndExec(base + encoded);
        return;
      } catch (e) {
        console.warn('[D2R] CDN 失敗，嘗試備用：', e.message);
      }
    }
    throw new Error('所有來源均無法載入：' + filePath);
  }

  try {
    for (const path of FILE_PATHS) await loadWithFallback(path);
  } catch (e) {
    console.warn('[D2R] 資料載入失敗，翻譯功能停用：', e.message);
    return;
  }

  // fetch + new Function 直接執行在當前 window，PAGE 即可讀到資料
  const ITEM_NAMES  = PAGE.D2R_ITEM_TRANSLATIONS || window.D2R_ITEM_TRANSLATIONS || {};
  const UI_NAMES    = PAGE.D2R_UI_TRANSLATIONS   || window.D2R_UI_TRANSLATIONS   || {};
  const AFFIXES_RAW = PAGE.D2R_AFFIXES            || window.D2R_AFFIXES            || [];

  if (!Object.keys(ITEM_NAMES).length) {
    console.warn('[D2R] 資料讀取為空，翻譯停用（請確認資料檔格式）');
    return;
  }

  // ── 設定（GM storage，fallback 到 localStorage）──
  const CONFIG = {
    enabled:      gmGet('d2r_enabled',      true),
    showOriginal: gmGet('d2r_showOriginal', true),
  };
  function saveConfig() {
    gmSet('d2r_enabled',      CONFIG.enabled);
    gmSet('d2r_showOriginal', CONFIG.showOriginal);
  }

  // ── 預編譯 ──
  const ITEM_ENTRIES = Object.entries(ITEM_NAMES).sort((a,b) => b[0].length - a[0].length);
  const UI_ENTRIES   = Object.entries(UI_NAMES).sort((a,b)   => b[0].length - a[0].length);
  const AFFIX_PAT    = AFFIXES_RAW
    .map(([src,tmpl]) => { try { return { re: new RegExp(src,'gi'), tmpl }; } catch(_){ return null; } })
    .filter(Boolean)
    .sort((a,b) => b.re.source.length - a.re.source.length);

  // ── 翻譯函式 ──
  function translateAffixes(text) {
    let r = text;
    for (const {re,tmpl} of AFFIX_PAT) {
      re.lastIndex = 0;
      if (re.test(r)) { re.lastIndex = 0; r = r.replace(re, tmpl); }
    }
    return r;
  }

  function applyDict(text, entries, showOrig) {
    const SLOT = /\x01(\d+)\x01/g;
    let r = text;
    const slots = [];
    for (const [en,zh] of entries) {
      if (r.toLowerCase().indexOf(en.toLowerCase()) === -1) continue;
      const esc = en.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const re  = new RegExp(`(?<![\\w'\\-])${esc}(?![\\w'\\-])`,'gi');
      r = r.replace(re, () => {
        slots.push(showOrig ? `${zh}(${en})` : zh);
        return `\x01${slots.length-1}\x01`;
      });
    }
    return r.replace(SLOT, (_,i) => slots[+i]);
  }

  function translate(text) {
    if (!text || !text.trim()) return text;
    let r = translateAffixes(text);
    r = applyDict(r, UI_ENTRIES,   false);
    r = applyDict(r, ITEM_ENTRIES, CONFIG.showOriginal);
    return r;
  }

  // ── DOM ──
  const SKIP = new Set(['SCRIPT','STYLE','NOSCRIPT','CODE','PRE','INPUT','TEXTAREA']);
  const nodeCache  = new WeakMap();
  const writingSet = new WeakSet();

  function processNode(node) {
    const p = node?.parentElement;
    if (!p || SKIP.has(p.tagName)) return;
    const cur = node.textContent;
    if (!cur || !cur.trim()) return;
    if (nodeCache.get(node) === cur) return;
    const result = translate(cur);
    nodeCache.set(node, result);
    if (result !== cur) {
      writingSet.add(node);
      node.textContent = result;
      Promise.resolve().then(() => writingSet.delete(node));
    }
  }

  function processTree(root) {
    if (!root || root.nodeType !== 1) return;
    const walker = document.createTreeWalker(
      root, NodeFilter.SHOW_TEXT,
      { acceptNode: n => (!n.parentElement || SKIP.has(n.parentElement.tagName))
          ? NodeFilter.FILTER_SKIP : NodeFilter.FILTER_ACCEPT }
    );
    const nodes = []; let n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(processNode);
  }

  // ── 頁碼選擇器 ──
  const MAX_PAGES = { uniques:17, runes:1, runewords:4, sets:7, base:21, crafted:1, gems:1, misc:3 };

  function injectPageSelector() {
    const pagebar = document.querySelector('.page-bar');
    if (!pagebar) return;
    pagebar.querySelectorAll('.d2r-page').forEach(el => el.remove());
    const mid = Array.from(pagebar.children).find(el => el.tagName === 'DIV' && !el.querySelector('a'));
    if (!mid) return;
    const pathMatch = location.pathname.match(/\/products\/([^/?#]+)/);
    const cat  = pathMatch ? pathMatch[1] : null;
    if (!cat) return;
    const maxP = MAX_PAGES[cat] ?? 99;
    const curP = parseInt(new URLSearchParams(location.search).get('page') ?? '0');
    const total = maxP + 1;

    const wrap = document.createElement('div');
    wrap.className = 'd2r-page';
    wrap.style.cssText = 'display:flex;align-items:center;gap:6px;justify-content:center;';

    const input = document.createElement('input');
    input.type  = 'number'; input.min = '1'; input.max = String(total);
    input.value = String(curP + 1); input.title = `1–${total}，Enter 跳轉`;
    input.style.cssText = 'width:46px;padding:3px 5px;font-size:14px;text-align:center;background:#111;color:#f0c060;border:1px solid #5a3a1a;border-radius:4px;appearance:textfield;-moz-appearance:textfield;';
    input.setAttribute('data-d2r-page', '1'); // 標記，避免中文搜尋攔截此輸入框

    const sep = document.createElement('span');
    sep.textContent = `/ ${total}`;
    sep.style.cssText = 'font-size:13px;color:#888;white-space:nowrap;';

    wrap.appendChild(input); wrap.appendChild(sep);
    mid.appendChild(wrap);
    mid.style.cssText = 'display:flex;align-items:center;justify-content:center;min-width:100px;';

    function jump() {
      const v = parseInt(input.value);
      if (isNaN(v)) return;
      const p = Math.max(0, Math.min(v-1, maxP));
      input.value = String(p+1);
      const u = new URL(location.href);
      u.searchParams.set('page', p);
      location.href = u.toString();
    }
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter')     { e.preventDefault(); jump(); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); input.value = String(Math.min(+input.value+1, total)); }
      if (e.key === 'ArrowDown') { e.preventDefault(); input.value = String(Math.max(+input.value-1, 1)); }
    });
    input.addEventListener('focus', () => input.select());
    input.addEventListener('change', jump);
  }

  // ── SPA 路由偵測 ──
  let lastPath = location.pathname + location.search;
  function onRouteChange() {
    const cur = location.pathname + location.search;
    if (cur === lastPath) return;
    lastPath = cur;
    document.querySelectorAll('.d2r-page').forEach(el => el.remove());
    setTimeout(injectPageSelector, 300);
    setTimeout(injectPageSelector, 800);
  }
  ['pushState','replaceState'].forEach(m => {
    const orig = history[m];
    history[m] = function(...args) { orig.apply(this, args); onRouteChange(); };
  });
  window.addEventListener('popstate', onRouteChange);

  // ── MutationObserver ──
  const pending = new Set();
  let rafId = null;
  function scheduleProcess() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      const batch = [...pending]; pending.clear();
      for (const node of batch) {
        if (node.nodeType === 1) {
          processTree(node);
          if (node.querySelector?.('.page-bar') || node.classList?.contains('page-bar'))
            injectPageSelector();
        } else if (node.nodeType === 3) processNode(node);
      }
    });
  }
  const observer = new MutationObserver(muts => {
    if (!CONFIG.enabled) return;
    for (const m of muts) {
      if (m.type === 'characterData') {
        if (writingSet.has(m.target)) continue;
        nodeCache.delete(m.target);
        pending.add(m.target);
      }
      for (const node of m.addedNodes) pending.add(node);
    }
    scheduleProcess();
  });

  // ── iOS 相容包裝：GM_ 函式不存在時 fallback 到 localStorage ──
  // （已在上方定義 gmStyle，此處呼叫）
  gmStyle(`
    #d2r-fab {
      position:fixed;bottom:20px;left:20px;z-index:99999;
      width:48px;height:48px;border-radius:50%;
      background:linear-gradient(135deg,#1a0a2e,#4a1a7a);
      border:2px solid #9b4dca;box-shadow:0 3px 12px rgba(0,0,0,.6);
      cursor:pointer;user-select:none;
      display:flex;align-items:center;justify-content:center;
      font-size:22px;transition:transform .15s,filter .2s;
    }
    #d2r-fab:hover{transform:scale(1.1);}
    #d2r-fab.off{filter:grayscale(1) brightness(.4);}
    #d2r-panel {
      position:fixed;bottom:78px;left:16px;z-index:99999;
      background:#120a24;border:1px solid #6a2fa0;border-radius:8px;
      padding:12px 14px;min-width:195px;
      box-shadow:0 4px 16px rgba(0,0,0,.7);
      color:#d4b0f0;font-size:13px;font-family:sans-serif;display:none;
    }
    #d2r-panel.open{display:block;}
    #d2r-panel h3{
      margin:0 0 10px;font-size:13px;color:#d4a0ff;
      border-bottom:1px solid #2d1456;padding-bottom:6px;
      display:flex;align-items:center;justify-content:space-between;
    }
    #d2r-panel h3 small{font-size:10px;color:#7a5a9a;font-weight:normal;}
    .d2r-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:8px;}
    .d2r-row label{cursor:pointer;color:#c0a0e0;}
    .d2r-toggle{position:relative;width:36px;height:20px;flex-shrink:0;}
    .d2r-toggle input{opacity:0;width:0;height:0;}
    .d2r-slider{
      position:absolute;inset:0;background:#2d1456;
      border:1px solid #6a2fa0;border-radius:20px;cursor:pointer;transition:background .2s;
    }
    .d2r-slider::before{
      content:'';position:absolute;width:12px;height:12px;background:#7a5a9a;
      border-radius:50%;top:3px;left:3px;transition:.2s;
    }
    .d2r-toggle input:checked+.d2r-slider{background:#6a1fa0;}
    .d2r-toggle input:checked+.d2r-slider::before{background:#d4a0ff;transform:translateX(16px);}
    .d2r-stat{font-size:11px;color:#7a5a9a;margin-top:8px;padding-top:6px;border-top:1px solid #2d1456;line-height:1.6;}

    /* 中文搜尋下拉清單 */
    #d2r-zh-dropdown {
      position:absolute;
      z-index:999999;
      background:#1a1220;
      border:1px solid #6a2fa0;
      border-radius:6px;
      box-shadow:0 4px 20px rgba(0,0,0,.8);
      max-height:320px;
      overflow-y:auto;
      min-width:260px;
      font-family:sans-serif;
      font-size:13px;
    }
    #d2r-zh-dropdown .d2r-zh-header {
      padding:6px 12px;
      font-size:11px;
      color:#7a5a9a;
      border-bottom:1px solid #2d1456;
      display:flex;
      align-items:center;
      gap:6px;
    }
    #d2r-zh-dropdown .d2r-zh-header span {
      color:#9b4dca;
      font-size:13px;
    }
    #d2r-zh-dropdown .d2r-item {
      padding:8px 12px;
      cursor:pointer;
      color:#d4b0f0;
      display:flex;
      justify-content:space-between;
      align-items:center;
      gap:12px;
      transition:background .1s;
      border-bottom:1px solid #1e1030;
    }
    #d2r-zh-dropdown .d2r-item:last-of-type {
      border-bottom:none;
    }
    #d2r-zh-dropdown .d2r-item:hover,
    #d2r-zh-dropdown .d2r-item.active {
      background:#2d1456;
    }
    #d2r-zh-dropdown .d2r-item .zh {
      color:#fff;
      font-weight:500;
    }
    #d2r-zh-dropdown .d2r-item .en {
      color:#7a5a9a;
      font-size:11px;
      text-align:right;
    }
    #d2r-zh-dropdown .d2r-hint {
      padding:6px 12px 8px;
      color:#5a3a7a;
      font-size:11px;
      border-top:1px solid #2d1456;
      text-align:center;
    }
  `);

  // ── 中文搜尋模組 ──

  // 判斷是否含中文
  function hasChinese(str) {
    return /[\u4e00-\u9fa5]/.test(str);
  }

  // 將正規表達式模式轉為可讀英文（用於顯示與搜尋）
  function regexToReadable(src) {
    return src
      .replace(/\(\?:.*?\)/g, 'X')        // 非捕獲群組
      .replace(/\((?:[^)]+)\)/g, 'X')     // 捕獲群組 → X
      .replace(/\[0-9\]\+/g, 'X')         // [0-9]+ → X
      .replace(/\[0-9\]\*/g, 'X')
      .replace(/\\d\+/g, 'X')
      .replace(/\\d\*/g, 'X')
      .replace(/\\\+/g, '+')
      .replace(/\\\./g, '.')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\[/g, '[')
      .replace(/\\\]/g, ']')
      .replace(/\\s\*/g, ' ')
      .replace(/\\s\+/g, ' ')
      .replace(/\?/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  // 建立反向對照表：中文 → 英文
  // 使用 Map<string, {zh, en}[]> 支援多重對應
  const ZH_TO_EN = {};

  // 1. 從道具名稱建立
  for (const [en, zh] of Object.entries(ITEM_NAMES)) {
    const zhClean = zh.replace(/\(.*?\)/g, '').trim();
    if (zhClean && !ZH_TO_EN[zhClean]) ZH_TO_EN[zhClean] = en;
  }

  // 2. 從詞綴（屬性）建立
  // AFFIXES_RAW 格式：[regex_src, zh_tmpl]
  // 例如：["\\+([0-9]+) to Life", "+$1 生命"]
  for (const [src, tmpl] of AFFIXES_RAW) {
    try {
      const enReadable = regexToReadable(src);
      if (!enReadable || enReadable.length < 2) continue;

      // 完整中文形式：把 $1/$2 換成 X，作為帶格式的顯示鍵
      const zhFull = tmpl.replace(/\$\d+/g, 'X').replace(/\s+/g, ' ').trim();

      // 關鍵字形式：去除數值佔位與符號，只留中文詞語
      const zhKeyword = tmpl
        .replace(/\$\d+/g, '')
        .replace(/[+\-% ]/g, '')
        .trim();

      // 加入完整形式（如「+X 生命」）
      if (zhFull.length >= 2 && !ZH_TO_EN[zhFull]) {
        ZH_TO_EN[zhFull] = enReadable;
      }

      // 加入關鍵字形式（如「生命」），若尚未被道具名佔用
      if (zhKeyword.length >= 2 && hasChinese(zhKeyword) && !ZH_TO_EN[zhKeyword]) {
        ZH_TO_EN[zhKeyword] = enReadable;
      }

      // 若中文模板本身不含數值佔位（純中文描述），直接加入
      if (!tmpl.includes('$') && hasChinese(tmpl) && !ZH_TO_EN[tmpl]) {
        ZH_TO_EN[tmpl] = enReadable;
      }
    } catch (_) {}
  }

  // 搜尋函式：中文片段 → [{zh, en, type}, ...]
  // type: 'item' | 'affix' 用於顯示標籤
  function searchZh(query) {
    if (!query || !query.trim()) return [];
    const q = query.trim();
    const exact = [], startsWith = [], contains = [];

    for (const [zh, en] of Object.entries(ZH_TO_EN)) {
      if (zh === q)              exact.push({ zh, en });
      else if (zh.startsWith(q)) startsWith.push({ zh, en });
      else if (zh.includes(q))   contains.push({ zh, en });
      if (exact.length + startsWith.length + contains.length >= 80) break;
    }

    // 去重（同一個英文搜尋詞只保留最短的中文顯示）
    const seen = new Map();
    for (const r of [...exact, ...startsWith, ...contains]) {
      if (!seen.has(r.en) || seen.get(r.en).zh.length > r.zh.length) {
        seen.set(r.en, r);
      }
    }
    return [...seen.values()].slice(0, 15);
  }

  // 建立下拉清單 DOM
  const zhDropdown = document.createElement('div');
  zhDropdown.id = 'd2r-zh-dropdown';
  zhDropdown.style.display = 'none';
  document.body.appendChild(zhDropdown);

  let activeIndex = -1;
  let currentResults = [];
  let currentInput = null;

  function positionDropdown(inputEl) {
    const rect = inputEl.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const dropH = Math.min(320, currentResults.length * 40 + 60);

    if (spaceBelow < dropH && spaceAbove > dropH) {
      // 往上開
      zhDropdown.style.top  = `${rect.top + window.scrollY - dropH - 4}px`;
    } else {
      zhDropdown.style.top  = `${rect.bottom + window.scrollY + 4}px`;
    }
    zhDropdown.style.left  = `${rect.left + window.scrollX}px`;
    zhDropdown.style.width = `${Math.max(rect.width, 260)}px`;
  }

  function renderDropdown(results, inputEl) {
    activeIndex = -1;
    currentResults = results;
    currentInput = inputEl;

    if (!results.length) {
      zhDropdown.style.display = 'none';
      return;
    }

    zhDropdown.innerHTML = '';

    // 標題列
    const header = document.createElement('div');
    header.className = 'd2r-zh-header';
    header.innerHTML = `<span>🔍</span> 中文搜尋結果（共 ${results.length} 項）`;
    zhDropdown.appendChild(header);

    results.forEach(({ zh, en }) => {
      const item = document.createElement('div');
      item.className = 'd2r-item';
      item.innerHTML = `<span class="zh">${zh}</span><span class="en">${en}</span>`;
      item.addEventListener('mousedown', e => {
        e.preventDefault();
        applySelection(en, inputEl);
      });
      zhDropdown.appendChild(item);
    });

    const hint = document.createElement('div');
    hint.className = 'd2r-hint';
    hint.textContent = '↑↓ 選擇　Enter 確認　Esc 關閉';
    zhDropdown.appendChild(hint);

    positionDropdown(inputEl);
    zhDropdown.style.display = 'block';
  }

  function applySelection(en, inputEl) {
    // 相容 React 受控元件
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    ).set;
    nativeInputValueSetter.call(inputEl, en);
    inputEl.dispatchEvent(new Event('input',  { bubbles: true }));
    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    inputEl.focus();
    zhDropdown.style.display = 'none';
    activeIndex = -1;
  }

  function setActive(idx) {
    const items = zhDropdown.querySelectorAll('.d2r-item');
    items.forEach(el => el.classList.remove('active'));
    if (idx >= 0 && idx < items.length) {
      items[idx].classList.add('active');
      items[idx].scrollIntoView({ block: 'nearest' });
    }
    activeIndex = idx;
  }

  // Fix 3 & 4: iOS 中文輸入法不一定觸發 input，需同時監聽 compositionend / keyup
  function handleZhInput(e) {
    if (!CONFIG.enabled) return;
    const el = e.target;
    if (el.tagName !== 'INPUT') return;
    if (el.type === 'hidden' || el.type === 'number') return;
    if (el.dataset.d2rPage) return;

    const val = el.value;
    if (!hasChinese(val)) {
      zhDropdown.style.display = 'none';
      return;
    }
    const results = searchZh(val);
    renderDropdown(results, el);
  }

  document.addEventListener('input',          handleZhInput, true);
  document.addEventListener('compositionend', handleZhInput, true);
  document.addEventListener('keyup',          handleZhInput, true);

  // 鍵盤操作（Enter 在下拉顯示時攔截，避免直接提交）
  document.addEventListener('keydown', e => {
    if (zhDropdown.style.display === 'none') return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(Math.min(activeIndex + 1, currentResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(Math.max(activeIndex - 1, 0));
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0) {
        e.preventDefault();
        e.stopPropagation();
        applySelection(currentResults[activeIndex].en, currentInput);
      } else {
        // 沒有選中任何項目時，取第一筆自動填入
        if (currentResults.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          applySelection(currentResults[0].en, currentInput);
        }
      }
    } else if (e.key === 'Escape') {
      zhDropdown.style.display = 'none';
      activeIndex = -1;
    }
  }, true);

  // 點擊其他地方關閉
  document.addEventListener('click', e => {
    if (!zhDropdown.contains(e.target) && e.target !== currentInput) {
      zhDropdown.style.display = 'none';
    }
  });

  // 滾動/縮放時重新定位
  window.addEventListener('scroll', () => {
    if (zhDropdown.style.display === 'none' || !currentInput) return;
    positionDropdown(currentInput);
  }, true);

  window.addEventListener('resize', () => {
    if (zhDropdown.style.display === 'none' || !currentInput) return;
    positionDropdown(currentInput);
  });

  // ── 浮動控制球 ──
  function createFAB() {
    const fab = document.createElement('div');
    fab.id = 'd2r-fab';
    fab.textContent = '⚔️';
    fab.title = 'D2R 中文翻譯';
    if (!CONFIG.enabled) fab.classList.add('off');

    const panel = document.createElement('div');
    panel.id = 'd2r-panel';

    const scriptVersion = '1.6';
    panel.innerHTML = `
      <h3>⚔️ D2R 中文翻譯 <span>v${scriptVersion}</span></h3>
      <div class="d2r-row">
        <label for="d2r-en">啟用翻譯</label>
        <label class="d2r-toggle">
          <input type="checkbox" id="d2r-en" ${CONFIG.enabled ? 'checked' : ''}>
          <span class="d2r-slider"></span>
        </label>
      </div>
      <div class="d2r-row">
        <label for="d2r-ori">物品附加原文</label>
        <label class="d2r-toggle">
          <input type="checkbox" id="d2r-ori" ${CONFIG.showOriginal ? 'checked' : ''}>
          <span class="d2r-slider"></span>
        </label>
      </div>
      <div class="d2r-stat">
        物品 ${ITEM_ENTRIES.length} 筆 ｜ UI ${UI_ENTRIES.length} 筆<br>
        效果詞彙 ${AFFIX_PAT.length} 條<br>
        中文搜尋共 ${Object.keys(ZH_TO_EN).length} 筆（含屬性）
      </div>
    `;

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    fab.addEventListener('click', e => {
      e.stopPropagation();
      panel.classList.toggle('open');
    });
    document.addEventListener('click', e => {
      if (!panel.contains(e.target) && e.target !== fab)
        panel.classList.remove('open');
    });

    panel.querySelector('#d2r-en').addEventListener('change', e => {
      CONFIG.enabled = e.target.checked;
      saveConfig();
      fab.classList.toggle('off', !CONFIG.enabled);
      CONFIG.enabled ? processTree(document.body) : location.reload();
    });

    panel.querySelector('#d2r-ori').addEventListener('change', e => {
      CONFIG.showOriginal = e.target.checked;
      saveConfig();
      location.reload();
    });
  }

  // ── 初始化 ──
  function init() {
    createFAB();
    if (!CONFIG.enabled) return;
    processTree(document.body);
    document.title = translate(document.title);
    observer.observe(document.body, { childList:true, subtree:true, characterData:true });
    injectPageSelector();
    setTimeout(injectPageSelector, 600);

    // Fix 2: iOS Safari MutationObserver 常漏觸發，加輪詢保命符
    setInterval(() => {
      if (CONFIG.enabled) processTree(document.body);
    }, 1500);

    console.log(`[D2R] 物品${ITEM_ENTRIES.length} UI${UI_ENTRIES.length} 效果${AFFIX_PAT.length} 中文搜尋${Object.keys(ZH_TO_EN).length}（含屬性）`);
  }

  // 資料已在頁面載入後才注入，DOM 必定 ready，直接呼叫
  init();
})();
