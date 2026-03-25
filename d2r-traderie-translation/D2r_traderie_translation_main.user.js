// ==UserScript==
// @name         Traderie D2R Chinese Translator (Supports cn search)
// @name:zh-TW   D2R Traderie 繁體中文翻譯 (支援中文搜尋)
// @name:zh-CN   D2R Traderie 繁体中文翻译（支援中文搜尋）
// @namespace    https://github.com/awdrrawd/D2R-storehouse
// @version      2.1.2
// @description  Traderie 的 D2R 繁體中文化，並支援中文搜尋
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

    // ════════════════════════════════════════
    //  資料載入（純 JSON，不需 eval）
    // ════════════════════════════════════════

    const FILE_PATHS = [
        'item/items.json',
        'Platform/tr_affixes.json',
        'Platform/tr_ui.json',
    ];

    const CDN_BASES = [
        'https://raw.githubusercontent.com/awdrrawd/D2R-storehouse/refs/heads/main/d2r-translation-data/',
        'https://cdn.jsdelivr.net/gh/awdrrawd/D2R-storehouse@main/d2r-translation-data/',
    ];

    async function fetchJSON(url) {
        const res = await fetch(url + '?t=' + Date.now(), { cache: 'no-cache' });
        if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
        const text = await res.text();

        try {
            return JSON.parse(text);
        } catch (e) {
            console.error("JSON解析失敗，內容前100字：", text.slice(0, 100));
            throw e;
        }
    }

    async function loadWithFallback(filePath) {
        for (const base of CDN_BASES) {
            try { return await fetchJSON(base + filePath); }
            catch (e) { console.warn('[D2R] 來源失敗，嘗試備用：', e.message); }
        }
        throw new Error('所有來源均無法載入：' + filePath);
    }

    let ITEM_NAMES, AFFIXES_TR, UI_NAMES;
    try {
        [ITEM_NAMES, AFFIXES_TR, UI_NAMES] = await Promise.all(FILE_PATHS.map(loadWithFallback));
    } catch (e) {
        console.warn('[D2R] 資料載入失敗，翻譯功能停用：', e.message);
        return;
    }

    if (!ITEM_NAMES || !Object.keys(ITEM_NAMES).length) {
        console.warn('[D2R] items.json 資料為空，翻譯停用');
        return;
    }

    // ── 設定 ──
    const CONFIG = { enabled: gmGet('d2r_enabled', true) };
    function saveConfig() { gmSet('d2r_enabled', CONFIG.enabled); }


    // ════════════════════════════════════════
    //  工具函式
    // ════════════════════════════════════════

    function hasChinese(str) { return /[\u4e00-\u9fa5]/.test(str); }


    // ════════════════════════════════════════
    //  預編譯字典
    // ════════════════════════════════════════

    // 物品 / UI：長 key 優先
    const ITEM_ENTRIES = Object.entries(ITEM_NAMES).sort((a, b) => b[0].length - a[0].length);
    const UI_ENTRIES   = Object.entries(UI_NAMES  ).sort((a, b) => b[0].length - a[0].length);

    // ── 詞綴：從 {"en_key": "zh_tmpl"} 建立 regex 匹配器 ──
    // key 範例：  "Fire Resist +{{value}}%"
    // tmpl 範例： "火焰抗性 +{{value}}%"
    // 佔位符：{{value}} {{level}} {{charges}} {{duration}}

    const PLACEHOLDER_RE = /\{\{(?:value|level|charges|duration)\}\}/g;
    const NUM_PAT = '([\\d.,+\\-]+(?:\\s*[-~]\\s*[\\d.,+\\-]+)?)';

    function buildAffixRegex(enKey) {
        const parts   = enKey.split(PLACEHOLDER_RE);
        const escaped = parts.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        let src = escaped[0];
        for (let i = 1; i < escaped.length; i++) src += NUM_PAT + escaped[i];
        return new RegExp(src, 'gi');
    }

    function buildAffixTemplate(zhTmpl) {
        let idx = 1;
        return zhTmpl.replace(PLACEHOLDER_RE, () => `$${idx++}`);
    }

    // TR 搜尋用的 EN 顯示文字（{{value}} → X，與 TR 介面下拉一致）
    function enDisplayText(enKey) {
        return enKey.replace(PLACEHOLDER_RE, 'X');
    }

    const AFFIX_PAT = Object.entries(AFFIXES_TR).map(([en, zh]) => {
        try { return { re: buildAffixRegex(en), tmpl: buildAffixTemplate(zh) }; }
        catch (_) { return null; }
    }).filter(Boolean).sort((a, b) => b.re.source.length - a.re.source.length);

    const AFFIX_X_MAP = {};
    for (const [en, zh] of Object.entries(AFFIXES_TR)) {
        const enX = en.replace(PLACEHOLDER_RE, 'X');
        const zhX = zh.replace(PLACEHOLDER_RE, 'X');
        AFFIX_X_MAP[enX] = zhX;
    }

    // 翻譯 X 格式詞綴的函式
    const AFFIX_X_ENTRIES = Object.entries(AFFIXES_TR)
    .map(([en, zh]) => {
        const enX = en.replace(PLACEHOLDER_RE, 'X');
        const zhX = zh.replace(PLACEHOLDER_RE, 'X');
        if (enX === zhX) return null;
        try {
            const esc = enX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return { re: new RegExp(esc, 'gi'), zh: zhX }; // ← 這裡預編譯
        } catch (_) { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => b.re.source.length - a.re.source.length);

    // 從 X 格式詞綴抽出「數字後面的部分」做對照
    const AFFIX_SUFFIX_MAP = {};
    for (const [en, zh] of Object.entries(AFFIXES_TR)) {
        const enX = en.replace(PLACEHOLDER_RE, '\x00');
        const zhX = zh.replace(PLACEHOLDER_RE, '\x00');
        const enParts = enX.split('\x00');
        const zhParts = zhX.split('\x00');
        // 取最後一段（數字後面的文字）
        const enSuffix = enParts[enParts.length - 1].trim();
        const zhSuffix = zhParts[zhParts.length - 1].trim();
        if (enSuffix.length > 2 && enSuffix !== zhSuffix)
            AFFIX_SUFFIX_MAP[enSuffix] = zhSuffix;
    }

    function translateAffixesX(text) {
        let r = text;
        for (const { re, zh } of AFFIX_X_ENTRIES) {
            re.lastIndex = 0; // ← 重置，不重新建立
            if (re.test(r)) { re.lastIndex = 0; r = r.replace(re, zh); }
        }
        return r;
    }


    // ════════════════════════════════════════
    //  中文搜尋反查表
    // ════════════════════════════════════════

    // 物品：zh → en（英文名稱填入搜尋框）
    const ITEM_ZH_TO_EN = {};
    for (const [en, zh] of Object.entries(ITEM_NAMES)) {
        const zhClean = zh.replace(/\(.*?\)/g, '').trim();
        if (zhClean && !ITEM_ZH_TO_EN[zhClean]) ITEM_ZH_TO_EN[zhClean] = en;
    }

    // 詞綴：zh關鍵字 → EN 顯示文字（填入 TR 搜尋框，X 取代數值）
    const AFFIX_ZH_TO_EN = {};
    for (const [en, zh] of Object.entries(AFFIXES_TR)) {
        const enDisplay = enDisplayText(en);                                        // "Fire Resist +X%"
        const zhDisplay = zh.replace(PLACEHOLDER_RE, 'X').trim();                  // "火焰抗性 +X%"
        const zhKeyword = zh.replace(PLACEHOLDER_RE, '').replace(/[+\-%\sX（）]+/g, '').trim(); // "火焰抗性"

        if (zhDisplay && hasChinese(zhDisplay) && !AFFIX_ZH_TO_EN[zhDisplay])
            AFFIX_ZH_TO_EN[zhDisplay] = enDisplay;
        if (zhKeyword.length >= 2 && hasChinese(zhKeyword) && !AFFIX_ZH_TO_EN[zhKeyword])
            AFFIX_ZH_TO_EN[zhKeyword] = enDisplay;
    }


    // ── DOM 翻譯用快取與狀態 ──
    const SKIP       = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'INPUT', 'TEXTAREA']);
    const nodeCache  = new WeakMap();
    const writingSet = new WeakSet();

    // ── 中文搜尋下拉狀態 ──
    let activeIndex    = -1;
    let currentResults = [];
    let currentInput   = null;
    let zhSearchTimer  = null;

    // ── 數字欄位旗標（暫停 MutationObserver，避免 Min/Max 輸入卡頓）──
    let isTypingInNumericField = false;

    // ── 路由暫存 ──
    let lastPath = location.pathname + location.search;

    // ── 導航鍵（不觸發重新搜尋）──
    const NAV_KEYS = ['ArrowUp', 'ArrowDown', 'Enter', 'Escape', 'Tab'];


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
        return translateAffixesX(r); // ← 加這行
    }

    // 翻譯順序：物品名稱（保護）→ 詞綴（數值替換）→ UI 文字
    function translate(text) {
        if (!text || !text.trim()) return text;
        const slots = [];
        const SLOT  = /\x01(\d+)\x01/g;
        let r = translateAffixes(text);                    // 1. 詞綴（含數字）
        r = slotEntries(r, ITEM_ENTRIES, slots, true);     // 2. 物品名
        r = slotEntries(r, UI_ENTRIES,   slots, false);    // 3. UI
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

        // ← 改這裡：cache 存翻譯結果，而不是原文
        const cached = nodeCache.get(node);
        const result = translate(cur);
        if (cached === result) return; // 已是最新翻譯結果，跳過

        nodeCache.set(node, result);   // ← 存翻譯後的文字
        if (result !== cur) {
            writingSet.add(node);
            node.textContent = result;
            Promise.resolve().then(() => writingSet.delete(node));
        }
    }

    // 新增：組合式詞綴翻譯（處理被拆分成多個 span 的屬性）
    function processAffixSpan(spanEl) {
        if (hasChinese(spanEl.textContent)) return;  // 已翻譯過

        const children = Array.from(spanEl.childNodes);
        if (!children.length) return;

        // 1. 組合完整文字（所有子節點）
        const combined = spanEl.textContent.trim();
        if (!combined) return;

        const translated = translate(combined);  // 使用完整 translate()，含詞綴字典
        if (translated === combined) return;

        console.log('[D2R] 翻譯詞綴:', combined, '→', translated);  // debug

        // 2. 保留紅色數字 span，不動
        const numSpans = spanEl.querySelectorAll('.text-\\[red\\]');
        const blueSpans = spanEl.querySelectorAll('.text-theme-listing-props');

        if (blueSpans.length < 2) return;  // 至少兩個藍字 span

        // 3. 分割翻譯結果，按原數字位置重新分配
        let parts = [translated];
        numSpans.forEach((numSpan, idx) => {
            const numVal = numSpan.textContent;
            parts = parts.flatMap(p => p.split(numVal));
            parts.splice(parts.length - (numSpans.length - idx), 0, numVal);  // 插入數字
        });

        // 4. 分配到藍字 span（前後部分）
        blueSpans.forEach((blueSpan, i) => {
            const partIdx = i * 2;  // 每個藍字對應 parts 的前/後部分
            if (parts[partIdx]) blueSpan.textContent = parts[partIdx];
        });
    }


    function processTree(root) {
        if (!root || root.nodeType !== 1) return;

        // ✅ 新增：先處理組合式詞綴 span（listing 屬性）
        root.querySelectorAll('.listing-num-properties > span').forEach(span => {
            if (!hasChinese(span.textContent)) processAffixSpan(span);
        });

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
        if (!query?.trim()) return [];
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
        for (const r of [...exact, ...startsWith, ...contains])
            if (!seen.has(r.en)) seen.set(r.en, r);
        return [...seen.values()].slice(0, 20);
    }

    function getFieldText(el) {
        if (el.placeholder) return el.placeholder;
        const descEl = el.getAttribute('aria-describedby')
        ? document.getElementById(el.getAttribute('aria-describedby')) : null;
        if (descEl) return descEl.textContent || '';
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
        const rect  = inputEl.getBoundingClientRect();
        const dropH = Math.min(320, currentResults.length * 40 + 60);
        if (window.innerHeight - rect.bottom < dropH && rect.top > dropH)
            zhDropdown.style.top = `${rect.top + window.scrollY - dropH - 4}px`;
        else
            zhDropdown.style.top = `${rect.bottom + window.scrollY + 4}px`;
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

    function handleZhInput(e) {
        if (!CONFIG.enabled) return;
        const el = e.target;
        if (el.tagName !== 'INPUT') return;
        if (el.type === 'hidden' || el.type === 'number') return;
        if (NAV_KEYS.includes(e.key)) return;

        // 純數字欄位（Min / Max）跳過，避免卡頓
        if (/^[\d\s.\-]*$/.test(el.value)) {
            zhDropdown.style.display = 'none';
            return;
        }

        cacheOriginalPlaceholder(el);
        clearTimeout(zhSearchTimer);
        zhSearchTimer = setTimeout(() => {
            const val = el.value;
            if (!hasChinese(val)) { zhDropdown.style.display = 'none'; return; }
            const mode = getSearchMode(el);
            renderDropdown(searchZh(val, mode), el, mode);
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

    // 數字欄位聚焦旗標（暫停 Observer 翻譯，避免 Min/Max 卡頓）
    document.addEventListener('focusin', e => {
        const el = e.target;
        if (el.tagName !== 'INPUT') return;
        const isMinMax = el.placeholder === 'Min' || el.placeholder === 'Max';
        // ✅ 空字串不算數字欄位；必須有非空的純數字內容
        const isNumericContent = el.value.length > 0 && /^[\d\s.\-]*$/.test(el.value);
        isTypingInNumericField = isMinMax || isNumericContent;
    }, true);

    document.addEventListener('focusout', () => { isTypingInNumericField = false; }, true);


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
        const fab = document.createElement('div');
        fab.id = 'd2r-fab';
        fab.textContent = '⚔️';
        fab.title = 'D2R 中文翻譯';
        if (!CONFIG.enabled) fab.classList.add('off');

        const panel = document.createElement('div');
        panel.id = 'd2r-panel';
        panel.innerHTML = `
      <h3>⚔️ D2R 中文翻譯 <small>v2.1.2</small></h3>
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
      </div>`;

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
        if (isTypingInNumericField) return;
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

        // iOS Safari 保命輪詢
        setInterval(() => {
            if (CONFIG.enabled && !isTypingInNumericField) processTree(document.body);
        }, 1500);
    }

    init();
})();
