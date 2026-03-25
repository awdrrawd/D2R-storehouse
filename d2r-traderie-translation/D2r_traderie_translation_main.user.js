// ==UserScript==
// @name         Traderie D2R Chinese Translator (Supports cn search)
// @name:zh-TW   D2R Traderie 繁體中文翻譯 (支援中文搜尋)
// @name:zh-CN   D2R Traderie 繁体中文翻译（支援中文搜尋）
// @namespace    https://github.com/awdrrawd/D2R-storehouse
// @version      2.1.1
// @description  Traderie 的 D2R 繁體中文化，並支援中文搜尋（僅載入翻譯資料）
// @author       瀧月瀨
// @match        https://traderie.com/diablo2resurrected*
// @match        https://*.traderie.com/diablo2resurrected/*
// @icon         https://www.google.com/s2/favicons?domain=traderie.com&sz=64
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @downloadURL  https://raw.githubusercontent.com/awdrrawd/D2R-storehouse/main/d2r-traderie-translation/D2r_traderie_translation_main.user.js
// @updateURL    https://raw.githubusercontent.com/awdrrawd/D2R-storehouse/main/d2r-traderie-translation/D2r_traderie_translation_main.user.js
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

    // ── 資料載入 ──
    const FILE_PATHS = ['item/items.js', 'item/affixes.js', 'Platform/ui_traderie.js'];

    const CDN_BASES = [
        `https://raw.githubusercontent.com/awdrrawd/D2R-storehouse/refs/heads/main/d2r-translation-data/`,
        `https://cdn.jsdelivr.net/gh/awdrrawd/D2R-storehouse@main/d2r-translation-data/`,
    ];

    async function fetchAndExec(url) {
        const res = await fetch(url + '?t=' + Date.now(), { cache: 'no-cache' });
        if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
        const code = await res.text();
        try { new Function(code)(); } catch (_) { eval(code); }
    }

    async function loadWithFallback(filePath) {
        for (const base of CDN_BASES) {
            try { await fetchAndExec(base + filePath); return; }
            catch (e) { console.warn('[D2R] 來源失敗，嘗試備用：', e.message); }
        }
        throw new Error('所有來源均無法載入：' + filePath);
    }

    try {
        for (const path of FILE_PATHS) await loadWithFallback(path);
    } catch (e) {
        console.warn('[D2R] 資料載入失敗，翻譯功能停用：', e.message);
        return;
    }

    // ── 從頁面 window 讀取三個字典 ──
    const ITEM_NAMES  = PAGE.D2R_ITEMS       || window.D2R_ITEMS       || {};
    const AFFIXES_RAW = PAGE.D2R_AFFIXES     || window.D2R_AFFIXES     || [];
    const UI_NAMES    = PAGE.D2R_UI_TRADERIC || window.D2R_UI_TRADERIC || {};

    if (!Object.keys(ITEM_NAMES).length) {
        console.warn('[D2R] items.js 資料為空，翻譯停用');
        return;
    }

    // ── 設定 ──
    const CONFIG = {
        enabled: gmGet('d2r_enabled', true),
    };
    function saveConfig() { gmSet('d2r_enabled', CONFIG.enabled); }

    // ── 預編譯字典 ──
    const ITEM_ENTRIES = Object.entries(ITEM_NAMES).sort((a, b) => b[0].length - a[0].length);
    const UI_ENTRIES   = Object.entries(UI_NAMES).sort((a, b) => b[0].length - a[0].length);

    const AFFIX_PAT = AFFIXES_RAW
        .map(([src, tmpl]) => { try { return { re: new RegExp(src, 'gi'), tmpl }; } catch (_) { return null; } })
        .filter(Boolean)
        .sort((a, b) => b.re.source.length - a.re.source.length);

    // ── 中文搜尋反查表 ──
    const ITEM_ZH_TO_EN  = {};
    const AFFIX_ZH_TO_EN = {};

    for (const [en, zh] of Object.entries(ITEM_NAMES)) {
        const zhClean = zh.replace(/\(.*?\)/g, '').trim();
        if (zhClean && !ITEM_ZH_TO_EN[zhClean]) ITEM_ZH_TO_EN[zhClean] = en;
    }

    for (const [src, tmpl] of AFFIXES_RAW) {
        try {
            const enReadable = regexToReadable(src);
            if (!enReadable || enReadable.length < 2) continue;
            const zhFull    = tmpl.replace(/\$\d+/g, 'X').replace(/\s+/g, ' ').trim();
            const zhKeyword = tmpl.replace(/\$\d+/g, '').replace(/[+\-%X\s（）]/g, '').trim();
            if (zhFull.length >= 2    && hasChinese(zhFull)    && !AFFIX_ZH_TO_EN[zhFull])    AFFIX_ZH_TO_EN[zhFull]    = enReadable;
            if (zhKeyword.length >= 2 && hasChinese(zhKeyword) && !AFFIX_ZH_TO_EN[zhKeyword]) AFFIX_ZH_TO_EN[zhKeyword] = enReadable;
            if (!tmpl.includes('$')   && hasChinese(tmpl)      && !AFFIX_ZH_TO_EN[tmpl])      AFFIX_ZH_TO_EN[tmpl]      = enReadable;
            if (zhFull.includes('X')  && hasChinese(zhFull)) {
                const subKw = zhFull.replace(/[\+\-]?X[\-X]*%?\s*/g, '').trim();
                if (subKw.length >= 2 && hasChinese(subKw) && !AFFIX_ZH_TO_EN[subKw]) AFFIX_ZH_TO_EN[subKw] = enReadable;
            }
        } catch (_) {}
    }

    // ── DOM 翻譯用快取與狀態 ──
    const SKIP       = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'INPUT', 'TEXTAREA']);
    const nodeCache  = new WeakMap();
    const writingSet = new WeakSet();

    // ── 中文搜尋下拉狀態 ──
    let activeIndex    = -1;
    let currentResults = [];
    let currentInput   = null;
    let zhSearchTimer  = null;       // debounce 計時器

    // ── 數字欄位輸入旗標（暫停 MutationObserver 翻譯，避免卡頓）──
    let isTypingInNumericField = false;

    // ── 路由偵測暫存 ──
    let lastPath = location.pathname + location.search;

    // ── 導航鍵清單（避免方向鍵觸發重新搜尋）──
    const NAV_KEYS = ['ArrowUp', 'ArrowDown', 'Enter', 'Escape', 'Tab'];


    // ════════════════════════════════════════
    //  工具函式
    // ════════════════════════════════════════

    function hasChinese(str) {
        return /[\u4e00-\u9fa5]/.test(str);
    }

    function regexToReadable(src) {
        let r = src, prev;
        do { prev = r; r = r.replace(/\((?:[^()])*\)/g, 'X'); } while (r !== prev);
        r = r.replace(/\[[^\]]*\]/g, 'X');
        r = r.replace(/\\([ +\-.()[\]{}|^$\\])/g, '$1');
        r = r.replace(/\\s/g, ' ').replace(/\\d/g, 'X').replace(/\\w/g, 'X');
        r = r.replace(/\\/g, '');
        r = r.replace(/(\w|X)[*+?]+/g, '$1');
        r = r.replace(/(?<![a-zA-Z0-9X])[*?]/g, '');
        r = r.replace(/X+/g, 'X').replace(/\s{2,}/g, ' ').trim();
        return r;
    }


    // ════════════════════════════════════════
    //  翻譯函式
    // ════════════════════════════════════════

    function slotEntries(text, entries, slots, showOrig) {
        let r = text;
        for (const [en, zh] of entries) {
            if (r.toLowerCase().indexOf(en.toLowerCase()) === -1) continue;
            const esc = en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const re  = new RegExp(`(?<![\\w'\\-])${esc}(?![\\w'\\-])`, 'gi');
            r = r.replace(re, () => {
                slots.push(showOrig ? `${zh}(${en})` : zh);
                return `\x01${slots.length - 1}\x01`;
            });
        }
        return r;
    }

    function translateAffixes(text) {
        let r = text;
        for (const { re, tmpl } of AFFIX_PAT) {
            re.lastIndex = 0;
            if (re.test(r)) { re.lastIndex = 0; r = r.replace(re, tmpl); }
        }
        return r;
    }

    function translate(text) {
        if (!text || !text.trim()) return text;
        const slots = [];
        const SLOT  = /\x01(\d+)\x01/g;
        let r = slotEntries(text, ITEM_ENTRIES, slots, true);
        r = translateAffixes(r);
        r = slotEntries(r, UI_ENTRIES, slots, false);
        return r.replace(SLOT, (_, i) => slots[+i]);
    }


    // ════════════════════════════════════════
    //  DOM 掃描 / 翻譯
    // ════════════════════════════════════════

    function processNode(node) {
        const p = node?.parentElement;
        if (!p || SKIP.has(p.tagName)) return;
        const cur = node.textContent;
        if (!cur || !cur.trim()) return;
        if (hasChinese(cur)) return;
        if (nodeCache.get(node) === cur) return;
        const result = translate(cur);
        nodeCache.set(node, cur);
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


    // ════════════════════════════════════════
    //  中文搜尋模組
    // ════════════════════════════════════════

    function searchZh(query, mode = 'item') {
        if (!query || !query.trim()) return [];
        const q = query.trim();
        const source = mode === 'affix' ? AFFIX_ZH_TO_EN : ITEM_ZH_TO_EN;
        const exact = [], startsWith = [], contains = [];
        for (const [zh, en] of Object.entries(source)) {
            if (zh === q)              exact.push({ zh, en });
            else if (zh.startsWith(q)) startsWith.push({ zh, en });
            else if (zh.includes(q))   contains.push({ zh, en });
            if (exact.length + startsWith.length + contains.length >= 100) break;
        }
        const seen = new Map();
        for (const r of [...exact, ...startsWith, ...contains]) {
            if (!seen.has(r.en)) seen.set(r.en, r);
        }
        return [...seen.values()].slice(0, 20);
    }

    function getFieldText(el) {
        if (el.placeholder) return el.placeholder;
        const descId = el.getAttribute('aria-describedby');
        if (descId) { const d = document.getElementById(descId); if (d) return d.textContent || ''; }
        let p = el.parentElement;
        for (let i = 0; i < 6 && p; i++, p = p.parentElement) {
            const ph = p.querySelector('[class*="placeholder"]');
            if (ph) return ph.textContent || '';
        }
        return '';
    }

    function cacheOriginalPlaceholder(el) {
        if (!el.dataset.d2rPhOrig) {
            const text = getFieldText(el);
            if (text) el.dataset.d2rPhOrig = text;
        }
    }

    function getSearchMode(el) {
        const ph = (el.dataset.d2rPhOrig || getFieldText(el) || '').toLowerCase();
        if (ph.includes('option') || ph.includes('stats') ||
            ph === 'more filters' || ph === '更多篩選' ||
            ph.includes('選項')   || ph.includes('屬性')) return 'affix';
        return 'item';
    }


    // ════════════════════════════════════════
    //  下拉清單 DOM
    // ════════════════════════════════════════

    const zhDropdown = document.createElement('div');
    zhDropdown.id = 'd2r-zh-dropdown';
    zhDropdown.style.display = 'none';
    document.body.appendChild(zhDropdown);

    function positionDropdown(inputEl) {
        const rect = inputEl.getBoundingClientRect();
        const dropH = Math.min(320, currentResults.length * 40 + 60);
        if (window.innerHeight - rect.bottom < dropH && rect.top > dropH) {
            zhDropdown.style.top = `${rect.top + window.scrollY - dropH - 4}px`;
        } else {
            zhDropdown.style.top = `${rect.bottom + window.scrollY + 4}px`;
        }
        zhDropdown.style.left  = `${rect.left + window.scrollX}px`;
        zhDropdown.style.width = `${Math.max(rect.width, 260)}px`;
    }

    function renderDropdown(results, inputEl, mode = 'item') {
        activeIndex    = -1;
        currentResults = results;
        currentInput   = inputEl;

        if (!results.length) { zhDropdown.style.display = 'none'; return; }

        zhDropdown.innerHTML = '';

        const header = document.createElement('div');
        header.className = 'd2r-zh-header';
        header.innerHTML = `<span>🔍</span> ${mode === 'affix' ? '屬性' : '道具'}搜尋（共 ${results.length} 項）`;
        zhDropdown.appendChild(header);

        results.forEach(({ zh, en }) => {
            const item = document.createElement('div');
            item.className = 'd2r-item';
            item.innerHTML = `<span class="zh">${zh}</span><span class="en">${en}</span>`;
            item.addEventListener('mousedown', e => { e.preventDefault(); applySelection(en, inputEl); });
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
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(inputEl, en);
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


    // ════════════════════════════════════════
    //  事件監聽
    // ════════════════════════════════════════

    // 中文搜尋輸入（input + compositionend 已足夠，不需 keyup）
    function handleZhInput(e) {
        if (!CONFIG.enabled) return;
        const el = e.target;
        if (el.tagName !== 'INPUT') return;
        if (el.type === 'hidden' || el.type === 'number') return;
        if (NAV_KEYS.includes(e.key)) return;

        // 純數字欄位（Min / Max）直接跳過
        if (/^[\d\s.\-]*$/.test(el.value)) {
            zhDropdown.style.display = 'none';
            return;
        }

        cacheOriginalPlaceholder(el);
        clearTimeout(zhSearchTimer);
        zhSearchTimer = setTimeout(() => {
            const val = el.value;
            if (!hasChinese(val)) { zhDropdown.style.display = 'none'; return; }
            renderDropdown(searchZh(val, getSearchMode(el)), el, getSearchMode(el));
        }, 150);
    }

    document.addEventListener('input',          handleZhInput, true);
    document.addEventListener('compositionend', handleZhInput, true);

    // 方向鍵 / Enter / Esc 控制下拉選單
    document.addEventListener('keydown', e => {
        if (zhDropdown.style.display === 'none') return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive(Math.min(activeIndex + 1, currentResults.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive(Math.max(activeIndex - 1, 0));
        } else if (e.key === 'Enter') {
            if (activeIndex >= 0 || currentResults.length > 0) {
                e.preventDefault(); e.stopPropagation();
                applySelection(currentResults[Math.max(activeIndex, 0)].en, currentInput);
            }
        } else if (e.key === 'Escape') {
            zhDropdown.style.display = 'none';
            activeIndex = -1;
        }
    }, true);

    document.addEventListener('click', e => {
        if (!zhDropdown.contains(e.target) && e.target !== currentInput)
            zhDropdown.style.display = 'none';
    });

    window.addEventListener('scroll', () => {
        if (zhDropdown.style.display !== 'none' && currentInput) positionDropdown(currentInput);
    }, true);

    window.addEventListener('resize', () => {
        if (zhDropdown.style.display !== 'none' && currentInput) positionDropdown(currentInput);
    });

    // 數字欄位聚焦旗標（暫停 MutationObserver 翻譯）
    document.addEventListener('focusin', e => {
        const el = e.target;
        if (el.tagName !== 'INPUT') return;
        isTypingInNumericField =
            el.placeholder === 'Min' || el.placeholder === 'Max' ||
            /^[\d\s.\-]*$/.test(el.value);
    }, true);

    document.addEventListener('focusout', () => {
        isTypingInNumericField = false;
    }, true);


    // ════════════════════════════════════════
    //  CSS
    // ════════════════════════════════════════

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

    #d2r-zh-dropdown {
      position:absolute;z-index:999999;
      background:#1a1220;border:1px solid #6a2fa0;border-radius:6px;
      box-shadow:0 4px 20px rgba(0,0,0,.8);
      max-height:320px;overflow-y:auto;min-width:260px;
      font-family:sans-serif;font-size:13px;
    }
    #d2r-zh-dropdown .d2r-zh-header {
      padding:6px 12px;font-size:11px;color:#7a5a9a;
      border-bottom:1px solid #2d1456;display:flex;align-items:center;gap:6px;
    }
    #d2r-zh-dropdown .d2r-zh-header span{color:#9b4dca;font-size:13px;}
    #d2r-zh-dropdown .d2r-item {
      padding:8px 12px;cursor:pointer;color:#d4b0f0;
      display:flex;justify-content:space-between;align-items:center;gap:12px;
      transition:background .1s;border-bottom:1px solid #1e1030;
    }
    #d2r-zh-dropdown .d2r-item:last-of-type{border-bottom:none;}
    #d2r-zh-dropdown .d2r-item:hover,
    #d2r-zh-dropdown .d2r-item.active{background:#2d1456;}
    #d2r-zh-dropdown .d2r-item .zh{color:#fff;font-weight:500;}
    #d2r-zh-dropdown .d2r-item .en{color:#7a5a9a;font-size:11px;text-align:right;}
    #d2r-zh-dropdown .d2r-hint {
      padding:6px 12px 8px;color:#5a3a7a;font-size:11px;
      border-top:1px solid #2d1456;text-align:center;
    }
  `);


    // ════════════════════════════════════════
    //  浮動控制球
    // ════════════════════════════════════════

    function createFAB() {
        const fab   = document.createElement('div');
        fab.id      = 'd2r-fab';
        fab.textContent = '⚔️';
        fab.title   = 'D2R 中文翻譯';
        if (!CONFIG.enabled) fab.classList.add('off');

        const panel = document.createElement('div');
        panel.id    = 'd2r-panel';
        panel.innerHTML = `
      <h3>⚔️ D2R 中文翻譯 <span>v2.1.1</span></h3>
      <div class="d2r-row">
        <label for="d2r-en">啟用翻譯</label>
        <label class="d2r-toggle">
          <input type="checkbox" id="d2r-en" ${CONFIG.enabled ? 'checked' : ''}>
          <span class="d2r-slider"></span>
        </label>
      </div>
      <div class="d2r-stat">
        道具 ${ITEM_ENTRIES.length} ｜ 介面 ${UI_ENTRIES.length} ｜ 屬性 ${AFFIX_PAT.length}<br>
        搜尋：道具 ${Object.keys(ITEM_ZH_TO_EN).length} ／ 屬性 ${Object.keys(AFFIX_ZH_TO_EN).length}
      </div>
    `;

        document.body.appendChild(fab);
        document.body.appendChild(panel);

        fab.addEventListener('click', e => { e.stopPropagation(); panel.classList.toggle('open'); });
        document.addEventListener('click', e => {
            if (!panel.contains(e.target) && e.target !== fab) panel.classList.remove('open');
        });
        panel.querySelector('#d2r-en').addEventListener('change', e => {
            CONFIG.enabled = e.target.checked;
            saveConfig();
            fab.classList.toggle('off', !CONFIG.enabled);
            CONFIG.enabled ? processTree(document.body) : location.reload();
        });
    }


    // ════════════════════════════════════════
    //  SPA 路由偵測
    // ════════════════════════════════════════

    function onRouteChange() {
        const cur = location.pathname + location.search;
        if (cur === lastPath) return;
        lastPath = cur;
        setTimeout(() => {
            if (CONFIG.enabled) {
                processTree(document.body);
                document.title = translate(document.title);
            }
        }, 500);
    }

    ['pushState', 'replaceState'].forEach(m => {
        const orig = history[m];
        history[m] = function (...args) { orig.apply(this, args); onRouteChange(); };
    });
    window.addEventListener('popstate', onRouteChange);


    // ════════════════════════════════════════
    //  MutationObserver
    // ════════════════════════════════════════

    const pending = new Set();
    let rafId = null;

    function scheduleProcess() {
        if (rafId) return;
        rafId = requestAnimationFrame(() => {
            rafId = null;
            const batch = [...pending]; pending.clear();
            for (const node of batch) {
                if (node.nodeType === 1)      processTree(node);
                else if (node.nodeType === 3) processNode(node);
            }
        });
    }

    const observer = new MutationObserver(muts => {
        if (!CONFIG.enabled) return;
        if (isTypingInNumericField) return;   // 數字欄位輸入時暫停，避免卡頓
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


    // ════════════════════════════════════════
    //  初始化
    // ════════════════════════════════════════

    function init() {
        createFAB();
        if (!CONFIG.enabled) return;
        processTree(document.body);
        document.title = translate(document.title);
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });

        // iOS Safari MutationObserver 常漏觸發，加輪詢保命符
        setInterval(() => {
            if (CONFIG.enabled && !isTypingInNumericField) processTree(document.body);
        }, 1500);
    }

    init();
})();
