// ==UserScript==
// @name         Traderie D2R Chinese Translator + Auto Edit
// @name:zh-TW   D2R Traderie 中文翻譯 + 自動編輯 (支援中文搜尋)
// @name:zh-CN   D2R Traderie 中文翻译 + 自动编辑（支援中文搜尋）
// @namespace    https://github.com/awdrrawd/D2R-storehouse
// @version      2.4.0
// @description  Traderie 的 D2R 中文化，支援中文搜尋，並整合快速編輯按鈕
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

    // ── 版本（獨立常數，modal 和更新判斷都用這裡）──
    const VERSION = '2.4.0';

    const FILE_PATHS = ['item/items.json','Platform/tr_affixes.json','Platform/tr_ui.json'];

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

    // ── 更新說明（非阻塞，失敗時靜默略過）──
    let CHANGELOG = null;
    try { CHANGELOG = await loadWithFallback('Platform/changelog.json'); } catch (_) {}

    // ════════════════════════════════════════
    //  ★ 語言設定（放在 CONFIG 之前，detectLang 需要先定義）
    // ════════════════════════════════════════

    // OpenCC converter（lazy 初始化，只有選 zh-CN 時才載入）
    let simplifiedConverter = null;
    let openccLoading = false;

    async function loadOpenCC() {
        if (simplifiedConverter) return true;
        if (openccLoading) {
            // 等待已在進行的載入完成
            await new Promise(resolve => {
                const check = setInterval(() => {
                    if (!openccLoading) { clearInterval(check); resolve(); }
                }, 100);
            });
            return !!simplifiedConverter;
        }
        openccLoading = true;
        try {
            // 動態載入 OpenCC（繁體用戶零負擔）
            await new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = 'https://cdn.jsdelivr.net/npm/opencc-js@1.0.5/dist/umd/full.js';
                s.onload = resolve;
                s.onerror = reject;
                document.head.appendChild(s);
            });
            // OpenCC 掛在 window.OpenCC
            simplifiedConverter = PAGE.OpenCC.Converter({ from: 'tw', to: 'cn' });
            console.log('[D2R] OpenCC 載入成功');
            return true;
        } catch (e) {
            console.warn('[D2R] OpenCC 載入失敗，將保持繁體：', e.message);
            return false;
        } finally {
            openccLoading = false;
        }
    }

    // 簡體 → 繁體 converter（搜尋反查用：使用者輸入簡體 → 轉繁體 → 查表）
    let toTWConverter = null;

    async function loadOpenCCReverse() {
        if (toTWConverter) return;
        // OpenCC 本體必須已載入
        if (!PAGE.OpenCC) await loadOpenCC();
        if (!PAGE.OpenCC) return;
        try {
            toTWConverter = PAGE.OpenCC.Converter({ from: 'cn', to: 'tw' });
        } catch (e) {
            console.warn('[D2R] 反向 OpenCC 建立失敗：', e.message);
        }
    }

    // 偵測瀏覽器語言，返回 'zh-TW' 或 'zh-CN'
    function detectBrowserLang() {
        const nav = (navigator.language || navigator.userLanguage || '').toLowerCase();
        // 簡體地區：中國大陸、新加坡
        if (nav === 'zh-cn' || nav === 'zh-hans' || nav === 'zh-sg') return 'zh-CN';
        // 繁體地區：台灣、香港、澳門
        // 由於使用OpenCC繁轉簡，所以預設為繁體
        return 'zh-TW';
    }

    // 取得實際生效語系（auto 時看瀏覽器）
    function detectLang() {
        if (CONFIG.lang !== 'auto') return CONFIG.lang;
        return detectBrowserLang();
    }

    // 翻譯出口：所有繁體翻譯結果都經過這裡
    function applyLang(text) {
        if (!text) return text;
        if (detectLang() === 'zh-CN' && simplifiedConverter) {
            return simplifiedConverter(text);
        }
        return text;
    }

    // ── 設定 ──
    const CONFIG = {
        enabled: gmGet('d2r_enabled', true),
        editBtn: gmGet('d2r_editbtn', true),
        lang:    gmGet('d2r_lang', 'auto')   // ★ 新增：'auto' | 'zh-TW' | 'zh-CN'
    };
    function saveConfig() {
        gmSet('d2r_enabled', CONFIG.enabled);
        gmSet('d2r_editbtn', CONFIG.editBtn);
        gmSet('d2r_lang',    CONFIG.lang);   // ★ 新增
    }

    // ★ 語言切換（清快取 → 重新掃描）
    async function switchLang(lang) {
        CONFIG.lang = lang;
        saveConfig();

        if (detectLang() === 'zh-CN') {
            await loadOpenCC();
            await loadOpenCCReverse();
        }

        // 清除節點快取，強制重新翻譯整頁
        nodeCache = new WeakMap();
        // 清除 affix 已翻譯標記
        document.querySelectorAll('[data-d2r-affix-translated]').forEach(el => {
            delete el.dataset.d2rAffixTranslated;
        });

        if (CONFIG.enabled) {
            processTree(document.body);
            document.title = applyLang(translate(document.title));
        }
    }


    // ════════════════════════════════════════
    //  工具函式
    // ════════════════════════════════════════

    function hasChinese(str) { return /[\u4e00-\u9fa5]/.test(str); }


    // ════════════════════════════════════════
    //  預編譯字典
    // ════════════════════════════════════════

    const ITEM_ENTRIES = Object.entries(ITEM_NAMES).sort((a, b) => b[0].length - a[0].length);
    const UI_ENTRIES   = Object.entries(UI_NAMES  ).sort((a, b) => b[0].length - a[0].length);

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

    function enDisplayText(enKey) {
        return enKey.replace(PLACEHOLDER_RE, 'X');
    }

    const AFFIX_PAT = Object.entries(AFFIXES_TR).map(([en, zh]) => {
        try { return { re: buildAffixRegex(en), tmpl: buildAffixTemplate(zh) }; }
        catch (_) { return null; }
    }).filter(Boolean).sort((a, b) => b.re.source.length - a.re.source.length);

    const AFFIX_X_ENTRIES = Object.entries(AFFIXES_TR)
    .map(([en, zh]) => {
        const enX = en.replace(PLACEHOLDER_RE, 'X');
        const zhX = zh.replace(PLACEHOLDER_RE, 'X');
        if (enX === zhX) return null;
        try {
            const esc = enX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return { re: new RegExp(esc, 'gi'), zh: zhX };
        } catch (_) { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => b.re.source.length - a.re.source.length);

    function translateAffixesX(text) {
        let r = text;
        for (const { re, zh } of AFFIX_X_ENTRIES) {
            re.lastIndex = 0;
            if (re.test(r)) { re.lastIndex = 0; r = r.replace(re, zh); }
        }
        return r;
    }


    // ════════════════════════════════════════
    //  中文搜尋反查表
    // ════════════════════════════════════════

    const ITEM_ZH_TO_EN = {};
    for (const [en, zh] of Object.entries(ITEM_NAMES)) {
        const zhClean = zh.replace(/\(.*?\)/g, '').trim();
        if (zhClean && !ITEM_ZH_TO_EN[zhClean]) ITEM_ZH_TO_EN[zhClean] = en;
    }

    const AFFIX_ZH_TO_EN = {};
    for (const [en, zh] of Object.entries(AFFIXES_TR)) {
        const enDisplay = enDisplayText(en);
        const zhDisplay = zh.replace(PLACEHOLDER_RE, 'X').trim();
        const zhKeyword = zh.replace(PLACEHOLDER_RE, '').replace(/[+\-%\sX（）]+/g, '').trim();

        if (zhDisplay && hasChinese(zhDisplay) && !AFFIX_ZH_TO_EN[zhDisplay])
            AFFIX_ZH_TO_EN[zhDisplay] = enDisplay;
        if (zhKeyword.length >= 2 && hasChinese(zhKeyword) && !AFFIX_ZH_TO_EN[zhKeyword])
            AFFIX_ZH_TO_EN[zhKeyword] = enDisplay;
    }


    // ── DOM 翻譯用快取與狀態 ──
    const SKIP       = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'INPUT', 'TEXTAREA']);
    // ★ 改為 let，switchLang 時需要重建
    let nodeCache  = new WeakMap();
    const writingSet = new WeakSet();

    // ── 中文搜尋下拉狀態 ──
    let activeIndex    = -1;
    let currentResults = [];
    let currentInput   = null;
    let zhSearchTimer  = null;

    // ── 數字欄位旗標 ──
    let isTypingInNumericField = false;

    // ── 路由暫存 ──
    let lastPath = location.pathname + location.search;

    // ── 導航鍵 ──
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
        return translateAffixesX(r);
    }

    // translate() 只負責繁體，applyLang() 在輸出時統一處理簡繁
    function translate(text) {
        if (!text || !text.trim()) return text;
        const slots = [];
        const SLOT  = /\x01(\d+)\x01/g;
        let r = translateAffixes(text);
        r = slotEntries(r, ITEM_ENTRIES, slots, true);
        r = slotEntries(r, UI_ENTRIES,   slots, false);
        return r.replace(SLOT, (_, i) => slots[+i]);
    }


    // ════════════════════════════════════════
    //  DOM 掃描 / 翻譯
    // ════════════════════════════════════════

    function processNode(node) {
        const p = node?.parentElement;
        if (!p || SKIP.has(p.tagName)) return;
        if (p.closest('[data-d2r-affix-translated]')) return;
        // ★ 聊天室區域不翻譯
        if (p.closest('.messages-container')) return;

        const cur = node.textContent;
        if (!cur || !cur.trim()) return;
        if (hasChinese(cur)) return;

        const cached = nodeCache.get(node);
        // ★ 翻譯後套用語系轉換
        const result = applyLang(translate(cur));
        if (cached === result) return;

        nodeCache.set(node, result);
        if (result !== cur) {
            writingSet.add(node);
            node.textContent = result;
            Promise.resolve().then(() => writingSet.delete(node));
        }
    }

    function processAffixSpan(spanEl) {
        if (spanEl.dataset.d2rAffixTranslated) return;
        if (hasChinese(spanEl.textContent)) return;
        // ★ 聊天室區域不翻譯
        if (spanEl.closest('.messages-container')) return;

        const combined = spanEl.textContent.trim();
        if (!combined) return;

        // ★ 翻譯後套用語系轉換
        const translated = applyLang(translate(combined));
        if (translated === combined) return;

        const blueSpans = spanEl.querySelectorAll('.text-theme-listing-props');
        if (blueSpans.length === 0) return;

        const nums = [...spanEl.querySelectorAll('.text-\\[red\\]')].map(s => s.textContent);
        let remaining = translated;
        nums.forEach(n => { remaining = remaining.replace(n, '\x00'); });
        const textParts = remaining.split('\x00');

        blueSpans.forEach((span, i) => {
            if (textParts[i] !== undefined) span.textContent = textParts[i];
        });

        spanEl.dataset.d2rAffixTranslated = 'true';
    }

    function processTree(root) {
        if (!root || root.nodeType !== 1) return;
        // ★ 聊天室區域完全跳過
        if (root.closest?.('.messages-container')) return;
        if (root.classList?.contains('messages-container')) return;

        root.querySelectorAll('.listing-num-properties > span').forEach(span => {
            processAffixSpan(span);
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
        // ★ 簡體模式：先把輸入轉繁體再查表（反查表 key 全是繁體）
        let q = query.trim();
        if (detectLang() === 'zh-CN' && toTWConverter) {
            q = toTWConverter(q);
        }
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

        setTimeout(() => {
            const form = inputEl.closest('form');
            if (form) {
                form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                return;
            }

            const container = inputEl.closest(
                '[class*="search"], [class*="filter"], [class*="Search"], form'
            ) || inputEl.parentElement;
            const searchBtn = container?.querySelector(
                'button[type="submit"], button[aria-label*="search" i], ' +
                'button[class*="search" i], [role="button"][class*="search" i], ' +
                'svg[class*="search" i]'
            );
            if (searchBtn) {
                searchBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                return;
            }

            inputEl.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Enter', code: 'Enter', keyCode: 13,
                bubbles: true, cancelable: true
            }));
            inputEl.dispatchEvent(new KeyboardEvent('keyup', {
                key: 'Enter', code: 'Enter', keyCode: 13,
                bubbles: true, cancelable: true
            }));
        }, 80);
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

    document.addEventListener('focusin', e => {
        const el = e.target;
        if (el.tagName !== 'INPUT') return;
        const isMinMax = el.placeholder === 'Min' || el.placeholder === 'Max';
        const isNumericContent = el.value.length > 0 && /^[\d\s.\-]*$/.test(el.value);
        isTypingInNumericField = isMinMax || isNumericContent;
    }, true);

    document.addEventListener('focusout', () => { isTypingInNumericField = false; }, true);


    // ════════════════════════════════════════
    //  ★ 編輯按鈕模組
    // ════════════════════════════════════════

    function isListingsOrWishlist() {
        const p = location.pathname;
        if (/\/diablo2resurrected\/profile\/[^/]+\/listings\/history/.test(p)) return false;
        return /\/diablo2resurrected\/profile\/[^/]+\/(listings|wishlist)/.test(p);
    }
    function isListingDetailPage() {
        return /\/diablo2resurrected\/listing\/\d+/.test(location.pathname);
    }

    function syncEditPageClass() {
        document.body.classList.toggle(
            'd2r-show-edit-btns',
            CONFIG.editBtn && isListingsOrWishlist()
        );
    }

    function addEditButtons() {
        if (!isListingsOrWishlist()) return;

        const listings = Array.from(
            document.querySelectorAll('.listing-row[id], .col-xs-12.col-sm-6.col-md-6.fade')
        ).filter(l =>
                 !l.querySelector('.tr-edit-btn') &&
                 !l.querySelector('.react-loading-skeleton')
                );

        listings.forEach(listing => {
            const listingId = listing.id?.match(/(\d+)/)?.[1];
            if (!listingId) return;

            const card = listing.querySelector('.sc-eqUAAy.sc-isRoRg');
            if (!card) return;

            const btn = document.createElement('div');
            btn.className = 'tr-edit-btn';
            btn.setAttribute('aria-label', '編輯此物品');
            btn.innerHTML = `
                <svg viewBox="0 0 24 24" width="14" height="14" fill="white" aria-hidden="true">
                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm18-11.5a1.003 1.003 0
                    0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75L21 5.75z"/>
                </svg>`;

            btn.addEventListener('click', e => {
                e.stopPropagation();
                e.preventDefault();
                sessionStorage.setItem('d2r_auto_edit', '1');
                location.href = `https://traderie.com/diablo2resurrected/listing/${listingId}`;
            }, true);

            card.style.position = 'relative';
            card.appendChild(btn);
        });
    }

    // ════════════════════════════════════════
    //  ★ 自動編輯模組
    // ════════════════════════════════════════

    const AE_DEBUG = false;
    function aeLog(...args) { if (AE_DEBUG) console.log('[D2R-AutoEdit]', ...args); }

    let autoEditObserver = null;
    let autoEditTimer    = null;
    let autoEditDone     = false;
    let pendingAutoEdit  = false;

    function scheduleClick(el, label) {
        aeLog(`找到編輯元素（${label}），等待下一幀後點擊：`, el);
        requestAnimationFrame(() => {
            if (!document.contains(el)) {
                aeLog('元素在 rAF 前已離開 DOM，放棄');
                return;
            }
            aeLog('開始 fireClick');
            ['mousedown', 'mouseup', 'click'].forEach(type => {
                let evt;
                try {
                    evt = new MouseEvent(type, { bubbles: true, cancelable: true, view: PAGE });
                } catch (_) {
                    evt = new MouseEvent(type, { bubbles: true, cancelable: true });
                }
                el.dispatchEvent(evt);
                aeLog(`  dispatched ${type}`);
            });
            aeLog('fireClick 完成 → 清除 pendingAutoEdit');
            pendingAutoEdit = false;
            autoEditDone    = true;
        });
    }

    function findEditTarget() {
        const svg = document.querySelector('#edit-listing, .listing-edit-icon');
        if (svg) {
            aeLog('找到 SVG #edit-listing，直接點擊它');
            return svg;
        }

        for (const d of document.querySelectorAll('div.tooltip, [class*="tooltip"]')) {
            const tip = d.querySelector('.tooltiptext');
            if (tip && /edit\s*listing/i.test(tip.textContent)) {
                const inner = d.querySelector('svg, button, [role="button"]');
                aeLog('透過 tooltiptext 找到，使用內部元素：', inner || d);
                return inner || d;
            }
        }

        aeLog('找不到編輯目標（元素尚未出現）');
        return null;
    }

    function tryClickEdit() {
        const target = findEditTarget();
        if (!target) return false;
        scheduleClick(target, target.id || target.className);
        return true;
    }

    function startAutoEdit() {
        aeLog('startAutoEdit 呼叫，路徑：', location.pathname);

        if (!CONFIG.editBtn) {
            sessionStorage.removeItem('d2r_auto_edit');
            return;
        }

        if (!isListingDetailPage()) {
            if (pendingAutoEdit || autoEditObserver) {
                aeLog('離開 listing 頁，清除所有自動編輯狀態');
                pendingAutoEdit = false;
                autoEditObserver?.disconnect();
                autoEditObserver = null;
                clearTimeout(autoEditTimer);
                autoEditTimer = null;
            }
            return;
        }

        if (sessionStorage.getItem('d2r_auto_edit')) {
            sessionStorage.removeItem('d2r_auto_edit');
            pendingAutoEdit = true;
            aeLog('從 sessionStorage 讀取旗標 → pendingAutoEdit = true');
        } else {
            aeLog('sessionStorage 無旗標，pendingAutoEdit =', pendingAutoEdit);
        }

        if (!pendingAutoEdit) {
            aeLog('pendingAutoEdit = false，不自動編輯');
            return;
        }

        if (autoEditDone) {
            aeLog('autoEditDone = true，已完成，跳過');
            return;
        }

        if (autoEditObserver) {
            aeLog('Observer 已在運行，跳過重複啟動');
            return;
        }

        aeLog('開始嘗試點擊編輯...');

        if (tryClickEdit()) {
            aeLog('初次嘗試成功');
            return;
        }

        aeLog('元素尚未出現，啟動 MutationObserver 等待');
        autoEditObserver = new MutationObserver(() => {
            if (!pendingAutoEdit || autoEditDone) {
                aeLog('Observer 觸發但 pending/done 狀態變更，斷開');
                autoEditObserver?.disconnect();
                autoEditObserver = null;
                clearTimeout(autoEditTimer);
                autoEditTimer = null;
                return;
            }
            const target = findEditTarget();
            if (target) {
                aeLog('Observer 找到目標，立即斷開後排程點擊');
                autoEditObserver.disconnect();
                autoEditObserver = null;
                clearTimeout(autoEditTimer);
                autoEditTimer = null;
                scheduleClick(target, target.id || target.className);
            }
        });
        autoEditObserver.observe(document.body, { childList: true, subtree: true });
        aeLog('Observer 已啟動，最多等待 15 秒');

        autoEditTimer = setTimeout(() => {
            aeLog('15 秒超時，放棄自動編輯');
            pendingAutoEdit = false;
            autoEditObserver?.disconnect();
            autoEditObserver = null;
            autoEditTimer    = null;
        }, 15000);
    }

    function resetAutoEditState() {
        aeLog('resetAutoEditState（保留 pendingAutoEdit =', pendingAutoEdit, '）');
        autoEditDone = false;
    }


    // ════════════════════════════════════════
    //  CSS（翻譯 UI + 編輯按鈕）
    // ════════════════════════════════════════

    gmStyle(`
    /* ══════ 控制面板 ══════ */
    #d2r-panel {
      position:fixed;bottom:78px;left:16px;z-index:99999;
      background:#120a24;border:1px solid #6a2fa0;border-radius:8px;
      padding:12px 14px;min-width:210px;
      box-shadow:0 4px 16px rgba(0,0,0,.7);
      color:#d4b0f0;font-size:13px;font-family:sans-serif;
      display:none;user-select:none;
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

    /* ★ 語言選擇下拉 */
    .d2r-select{
      background:#1e0d38;border:1px solid #6a2fa0;
      border-radius:4px;color:#c0a0e0;
      font-size:12px;padding:3px 6px;cursor:pointer;
      outline:none;
    }
    .d2r-select:focus{border-color:#9b4dca;}

    /* 語言載入提示 */
    #d2r-lang-status{
      font-size:10px;color:#7a5a9a;text-align:right;
      min-height:14px;margin-top:-4px;margin-bottom:4px;
    }

    /* 面板底部按鈕列 */
    .d2r-panel-btns{
      display:flex;gap:6px;margin-top:10px;padding-top:8px;
      border-top:1px solid #2d1456;
    }
    .d2r-panel-btn{
      flex:1;padding:5px 4px;font-size:11px;cursor:pointer;
      background:#1e0d38;border:1px solid #6a2fa0;border-radius:5px;
      color:#c0a0e0;text-align:center;transition:background .15s,color .15s;
      text-decoration:none;display:flex;align-items:center;justify-content:center;gap:4px;
    }
    .d2r-panel-btn:hover{background:#2d1456;color:#d4a0ff;}

    /* ══════ 通用 Modal ══════ */
    #d2r-modal-overlay{
      position:fixed;inset:0;z-index:9999999;
      background:rgba(0,0,0,.7);display:flex;
      align-items:center;justify-content:center;padding:16px;
    }
    #d2r-modal{
      background:#120a24;border:1px solid #6a2fa0;border-radius:10px;
      max-width:420px;width:100%;max-height:80vh;
      display:flex;flex-direction:column;
      box-shadow:0 8px 32px rgba(0,0,0,.8);
      font-family:sans-serif;user-select:none;
    }
    #d2r-modal-title{
      padding:16px 16px 13px;font-size:16px;font-weight:700;
      color:#d4a0ff;border-bottom:1px solid #2d1456;flex-shrink:0;
      display:flex;align-items:center;justify-content:center;gap:8px;
      text-align:center;
    }
    #d2r-modal-body{
      padding:14px 16px;font-size:13px;color:#c0a0e0;
      line-height:1.7;overflow-y:auto;flex:1;
      user-select:text;
    }
    #d2r-modal-body a{color:#9b6dca;text-decoration:underline;}
    #d2r-modal-footer{
      padding:10px 16px 14px;border-top:1px solid #2d1456;
      flex-shrink:0;display:flex;align-items:center;justify-content:center;gap:8px;
    }
    .d2r-modal-btn-left{ margin-right:auto; }
    .d2r-modal-btn{
      padding:7px 16px;font-size:13px;cursor:pointer;
      background:#1e0d38;border:1px solid #6a2fa0;border-radius:6px;
      color:#c0a0e0;transition:background .15s;
    }
    .d2r-modal-btn:hover{background:#2d1456;}
    .d2r-modal-btn-primary{
      background:#6a1fa0;border-color:#9b4dca;color:#fff;
    }
    .d2r-modal-btn-primary:hover{background:#9b4dca;}
    #d2r-modal-close{
      padding:7px 18px;font-size:13px;cursor:pointer;
      background:#6a1fa0;border:none;border-radius:6px;
      color:#fff;transition:background .15s;
    }
    #d2r-modal-close:hover{background:#9b4dca;}

    /* ══════ 中文搜尋下拉 ══════ */
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

    /* ══════ 編輯快捷按鈕 ══════ */
    .tr-edit-btn {
      display:none;
      position:absolute;top:6px;right:6px;
      width:26px;height:26px;
      background:rgba(220,50,50,0.92);border-radius:50%;
      align-items:center;justify-content:center;
      cursor:pointer;z-index:20;opacity:0.85;
      transition:opacity .15s,transform .15s;pointer-events:auto;
    }
    body.d2r-show-edit-btns .tr-edit-btn{display:flex;}
    .tr-edit-btn:hover{opacity:1;transform:scale(1.15);}

    /* ══════ PC navbar 按鈕 ══════ */
    #d2r-navbar-btn{
      display:flex;align-items:center;gap:5px;
      cursor:pointer;color:inherit;text-decoration:none;
      font-size:14px;margin-left:6px;padding:4px 8px;
      border-radius:6px;background:rgba(154,77,202,0.15);
      border:1px solid rgba(154,77,202,0.4);
      transition:background .15s,border-color .15s;
      white-space:nowrap;user-select:none;
    }
    #d2r-navbar-btn:hover{background:rgba(154,77,202,0.3);border-color:#9b4dca;}

    body.d2r-desktop #d2r-panel{
      top:auto;bottom:auto;left:auto;right:auto;
    }
    `);

    function positionPanelByBtn(btn, panel) {
        const r = btn.getBoundingClientRect();
        const pw = 220;
        let left = r.right - pw + window.scrollX;
        if (left < 8) left = 8;
        panel.style.left  = left + 'px';
        panel.style.right = 'auto';
        panel.style.top   = (r.bottom + window.scrollY + 6) + 'px';
        panel.style.bottom = 'auto';
    }


    // ════════════════════════════════════════
    //  通用 Modal 系統
    // ════════════════════════════════════════

    function showModal({ title, html, closeTxt = '關閉', onClose, buttons } = {}) {
        document.getElementById('d2r-modal-overlay')?.remove();

        const btns = buttons || [{ txt: closeTxt, primary: true, onClick: onClose }];
        const footerHTML = btns.map((b, i) =>
                                    `<button class="d2r-modal-btn${b.primary ? ' d2r-modal-btn-primary' : ''}${b.left ? ' d2r-modal-btn-left' : ''}"
              data-bi="${i}">${b.txt}</button>`
                                   ).join('');

        const overlay = document.createElement('div');
        overlay.id = 'd2r-modal-overlay';
        overlay.innerHTML = `
          <div id="d2r-modal">
            <div id="d2r-modal-title">${title}</div>
            <div id="d2r-modal-body">${html}</div>
            <div id="d2r-modal-footer">${footerHTML}</div>
          </div>`;
        document.body.appendChild(overlay);

        overlay.querySelectorAll('.d2r-modal-btn').forEach(el => {
            el.addEventListener('click', () => {
                const cb = btns[+el.dataset.bi]?.onClick;
                overlay.remove();
                cb?.();
            });
        });
        overlay.addEventListener('click', e => {
            if (e.target === overlay) { overlay.remove(); onClose?.(); }
        });
    }

    function showChangelogModal(force = false) {
        if (!CHANGELOG) return;

        const versions = Array.isArray(CHANGELOG.versions)
        ? CHANGELOG.versions
        : [{ version: CHANGELOG.version, title: CHANGELOG.title, content: CHANGELOG.content }];

        const latestVer = CHANGELOG.latest || versions[0]?.version || '';
        const seenVer   = gmGet('d2r_seen_ver', '');
        if (!force && seenVer === latestVer) return;

        function showList() {
            const listHTML = versions.map((v, i) => `
              <div class="d2r-ver-item" data-vi="${i}" style="
                padding:9px 12px;cursor:pointer;border-radius:6px;
                display:flex;justify-content:space-between;align-items:center;
                background:${i === 0 ? 'rgba(106,47,160,0.2)' : 'transparent'};
                border:1px solid ${i === 0 ? '#6a2fa0' : 'transparent'};
                margin-bottom:6px;transition:background .15s;">
                <div>
                  <span style="color:#d4a0ff;font-weight:600">${v.version}</span>
                  ${i === 0 ? '<span style="color:#9b4dca;font-size:11px;margin-left:6px">最新</span>' : ''}
                  <div style="font-size:11px;color:#7a5a9a;margin-top:2px">${v.title || ''}</div>
                </div>
                <span style="color:#6a2fa0;font-size:16px">›</span>
              </div>`).join('');

            showModal({
                title: '📋 更新歷程',
                html: `<div style="font-size:12px;color:#7a5a9a;margin-bottom:10px">
                         共 ${versions.length} 個版本，點擊查看詳細說明
                       </div>${listHTML}`,
                buttons: [
                    { txt: '關閉', primary: true,
                     onClick: () => gmSet('d2r_seen_ver', latestVer) }
                ]
            });
            setTimeout(() => {
                document.querySelectorAll('.d2r-ver-item').forEach(el => {
                    el.addEventListener('mouseover', () => {
                        el.style.background = 'rgba(106,47,160,0.25)';
                    });
                    el.addEventListener('mouseout', () => {
                        el.style.background = +el.dataset.vi === 0 ? 'rgba(106,47,160,0.2)' : 'transparent';
                    });
                    el.addEventListener('click', () => showDetail(+el.dataset.vi));
                });
            }, 0);
        }

        function showDetail(idx) {
            const v = versions[idx];
            const bodyHTML = (v.content || '（無說明）').replace(/\n/g, '<br>');
            showModal({
                title: `📋 ${v.title || 'v' + v.version}`,
                html: bodyHTML,
                buttons: [
                    { txt: '← 返回', left: true, onClick: showList },
                    { txt: '關閉', primary: true,
                     onClick: () => gmSet('d2r_seen_ver', latestVer) }
                ]
            });
        }

        showList();
    }

    function showAboutModal() {
        const latestVer = CHANGELOG
        ? (CHANGELOG.latest || CHANGELOG.versions?.[0]?.version || CHANGELOG.version)
        : null;
        const html = `
          <div style="margin-bottom:10px">
            <strong style="color:#d4a0ff">⚔️ Traderie D2R 繁體中文翻譯　　　　　　作者 瀧月瀨(likolisu)</strong><br><br>
            <span style="color:#bf8cf3">功能：介面中文化 ／ 中文關鍵字搜尋 ／ 快捷編輯按鈕</span>
          </div>
          <div style="margin-bottom:10px;font-size:12px;color:#9a7ab0;line-height:1.8">
            已翻譯<br>
            道具名稱：${ITEM_ENTRIES.length} 條<br>
            屬性詞綴：${AFFIX_PAT.length} 條<br>
            介面文字：${UI_ENTRIES.length} 條<br>
            搜尋（道具）：${Object.keys(ITEM_ZH_TO_EN).length} 條<br>
            搜尋（屬性）：${Object.keys(AFFIX_ZH_TO_EN).length} 條
          </div>
          <div style="font-size:12px;color:#7a5a9a">
            <a href="https://github.com/awdrrawd/D2R-storehouse/" target="_blank">
              ⌨ GitHub
            </a><br>
            <a href="https://greasyfork.org/zh-TW/scripts/570784-traderie-d2r-chinese-translator-supports-cn-search" target="_blank">
              ⌨ Greasy Fork
            </a>
            ${latestVer ? `<br><br><span style="color:#9a7ab0">當前版本：${latestVer}</span>` : ''}
          </div>`;
        showModal({ title: '❓ 關於本插件', html, closeTxt: '關閉' });
    }


    // ════════════════════════════════════════
    //  控制面板（無浮動球，由 Navbar 按鈕控制）
    // ════════════════════════════════════════

    function createPanel() {
        const panel = document.createElement('div');
        panel.id = 'd2r-panel';

        // ★ 語言選單：auto / zh-TW / zh-CN
        // detectBrowserLang() 先算好，顯示在 auto 選項旁給使用者參考
        const browserLang = detectBrowserLang();
        const browserHint = browserLang === 'zh-CN' ? '简体' : '繁體';

        panel.innerHTML = `
      <h3>⚔️ D2R 中文翻譯 <small>v${VERSION}</small></h3>
      <div class="d2r-row">
        <label for="d2r-en">啟用翻譯</label>
        <label class="d2r-toggle">
          <input type="checkbox" id="d2r-en" ${CONFIG.enabled ? 'checked' : ''}>
          <span class="d2r-slider"></span>
        </label>
      </div>
      <div class="d2r-row">
        <label for="d2r-eb" title="在 listings/wishlist 頁顯示快速編輯按鈕">編輯快捷按鈕</label>
        <label class="d2r-toggle">
          <input type="checkbox" id="d2r-eb" ${CONFIG.editBtn ? 'checked' : ''}>
          <span class="d2r-slider"></span>
        </label>
      </div>
      <div class="d2r-row">
        <label for="d2r-lang-sel">語言</label>
        <select id="d2r-lang-sel" class="d2r-select">
          <option value="auto" ${CONFIG.lang === 'auto'  ? 'selected' : ''}>自動（${browserHint}）</option>
          <option value="zh-TW" ${CONFIG.lang === 'zh-TW' ? 'selected' : ''}>繁體中文</option>
          <option value="zh-CN" ${CONFIG.lang === 'zh-CN' ? 'selected' : ''}>简体中文</option>
        </select>
      </div>
      <div id="d2r-lang-status"></div>
      <div class="d2r-panel-btns">
        <button class="d2r-panel-btn" id="d2r-btn-about">❓ 關於</button>
        <button class="d2r-panel-btn" id="d2r-btn-log">📋 更新</button>
        <a class="d2r-panel-btn" id="d2r-btn-gh"
           href="https://github.com/awdrrawd/D2R-storehouse/" target="_blank">
          <img src="https://www.google.com/s2/favicons?domain=github.com&sz=16"
               width="14" height="14" style="vertical-align:middle;border-radius:2px"> GitHub</a>
      </div>`;

        document.body.appendChild(panel);

        const togglePanel = (e, anchorEl) => {
            e.stopPropagation();
            const opening = !panel.classList.contains('open');
            panel.classList.toggle('open', opening);
            if (opening && anchorEl) positionPanelByBtn(anchorEl, panel);
        };
        document.addEventListener('click', e => {
            if (!panel.contains(e.target) &&
                !e.target.closest('#d2r-navbar-btn'))
                panel.classList.remove('open');
        });

        // 翻譯開關
        panel.querySelector('#d2r-en').addEventListener('change', e => {
            CONFIG.enabled = e.target.checked;
            saveConfig();
            CONFIG.enabled ? processTree(document.body) : location.reload();
        });

        // 編輯快捷按鈕開關
        panel.querySelector('#d2r-eb').addEventListener('change', e => {
            CONFIG.editBtn = e.target.checked;
            saveConfig();
            syncEditPageClass();
        });

        // ★ 語言切換
        const langStatus = panel.querySelector('#d2r-lang-status');
        panel.querySelector('#d2r-lang-sel').addEventListener('change', async e => {
            const val = e.target.value;
            CONFIG.lang = val;
            saveConfig();

            if (detectLang() === 'zh-CN') {
                langStatus.textContent = '⏳ 載入簡體轉換模組...';
                const ok = await loadOpenCC();
                await loadOpenCCReverse();
                langStatus.textContent = ok ? '✅ 簡體模組已就緒' : '⚠️ 載入失敗，保持繁體';
                setTimeout(() => { langStatus.textContent = ''; }, 3000);
            } else {
                langStatus.textContent = '';
            }

            await switchLang(val);
        });

        // 關於 / 更新說明
        panel.querySelector('#d2r-btn-about').addEventListener('click', () => {
            panel.classList.remove('open');
            showAboutModal();
        });
        panel.querySelector('#d2r-btn-log').addEventListener('click', () => {
            panel.classList.remove('open');
            showChangelogModal(true);
        });

        // ── Navbar 注入 ──
        injectNavBtn(togglePanel);
    }

    function injectNavBtn(onToggle) {
        let injected = false;

        const tryInject = () => {
            if (injected) return;
            const navRight = document.querySelector('.nav-right');
            if (!navRight || navRight.offsetParent === null) return;

            injected = true;
            document.body.classList.add('d2r-desktop');

            const btn = document.createElement('div');
            btn.id = 'd2r-navbar-btn';
            btn.title = 'D2R 中文翻譯';
            btn.innerHTML = `⚔️ <span style="font-size:12px">翻譯</span>`;
            btn.addEventListener('click', e => onToggle(e, btn));

            const logoBlock = document.querySelector('.sc-iHmpnF.dlcFuQ');
            if (logoBlock && logoBlock.parentElement) {
                logoBlock.parentElement.insertBefore(btn, logoBlock.nextSibling);
            } else {
                navRight.appendChild(btn);
            }
        };

        tryInject();
        const navObs = new MutationObserver(() => {
            if (injected) { navObs.disconnect(); return; }
            tryInject();
        });
        navObs.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => navObs.disconnect(), 30000);
    }


    // ════════════════════════════════════════
    //  SPA 路由偵測
    // ════════════════════════════════════════

    function onRouteChange() {
        const cur = location.pathname + location.search;
        if (cur === lastPath) return;
        lastPath = cur;

        clearTimeout(zhSearchTimer);
        zhDropdown.style.display = 'none';

        resetAutoEditState();
        syncEditPageClass();

        setTimeout(() => {
            if (CONFIG.enabled) {
                processTree(document.body);
                document.title = applyLang(translate(document.title));
            }
            startAutoEdit();
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
                if (node.nodeType === 1) {
                    if (CONFIG.enabled) processTree(node);
                    if (CONFIG.editBtn && isListingsOrWishlist()) addEditButtons();
                } else if (node.nodeType === 3 && CONFIG.enabled) processNode(node);
            }
        });
    }

    const observer = new MutationObserver(muts => {
        if (isTypingInNumericField) return;
        const doTranslate = CONFIG.enabled;
        const doEditBtn   = CONFIG.editBtn && isListingsOrWishlist();
        if (!doTranslate && !doEditBtn) return;

        for (const m of muts) {
            if (doTranslate && m.type === 'characterData') {
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

    async function init() {
        if (detectLang() === 'zh-CN') {
            loadOpenCC();
            loadOpenCCReverse();
        }

        createPanel();
        syncEditPageClass();
        addEditButtons();
        startAutoEdit();

        if (CONFIG.enabled) {
            processTree(document.body);
            document.title = applyLang(translate(document.title));
        }
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });

        let lastChildCount = document.body.childElementCount;
        setInterval(() => {
            if (isTypingInNumericField) return;
            const count = document.body.childElementCount;
            const changed = count !== lastChildCount;
            lastChildCount = count;
            if (!changed) return;
            if (CONFIG.enabled) processTree(document.body);
            if (CONFIG.editBtn && isListingsOrWishlist()) addEditButtons();
        }, 1500);

        setTimeout(() => showChangelogModal(), 1200);
    }

    init();
})();
