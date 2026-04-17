// ==UserScript==
// @name               Traderie D2R Chinese Translator + Chinese search
// @name:zh-tw         D2R Traderie 中文翻譯 + 自動編輯 (支援中文搜尋)
// @name:zh-cn         D2R Traderie 中文翻译 + 自动编辑 (支援中文搜尋)
// @namespace          https://github.com/awdrrawd/D2R-storehouse
// @version            2.4.5
// @description        Traderie 的 D2R 中文化，支援中文搜尋，並新增快捷編輯
// @description:zh-tw  Traderie 的 D2R 中文化，支援中文搜尋，並新增快捷編輯
// @description:zh-cn  Traderie 的 D2R 中文化，支援中文搜寻，并新增快捷编辑
// @author             瀧月瀨
// @license            CC BY-ND 4.0
// @match              https://traderie.com/diablo2resurrected*
// @match              https://*.traderie.com/diablo2resurrected/*
// @icon               https://www.google.com/s2/favicons?domain=traderie.com&sz=64
// @require            https://cdn.jsdelivr.net/npm/opencc-js@1.0.5/dist/umd/full.js
// @grant              GM_addStyle
// @grant              GM_getValue
// @grant              GM_setValue
// @grant              unsafeWindow
// @run-at             document-idle
// @downloadURL        https://update.greasyfork.org/scripts/570784/Traderie%20D2R%20Chinese%20Translator%20%2B%20Chinese%20search1.user.js
// @updateURL          https://update.greasyfork.org/scripts/570784/Traderie%20D2R%20Chinese%20Translator%20%2B%20Chinese%20search1.meta.js
// ==/UserScript==

(async function () {
    'use strict';

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

    const VERSION = '2.4.5';

    const FILE_PATHS = ['item/items.json','Platform/tr_affixes.json','Platform/tr_ui.json'];
    const CDN_BASES = [
        'https://raw.githubusercontent.com/awdrrawd/D2R-storehouse/refs/heads/main/d2r-translation-data/',
        'https://cdn.jsdelivr.net/gh/awdrrawd/D2R-storehouse@main/d2r-translation-data/',
    ];

    async function fetchJSON(url) {
        const res = await fetch(url + '?t=' + Date.now(), { cache: 'no-cache' });
        if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
        const text = await res.text();
        try { return JSON.parse(text); }
        catch (e) { console.error("JSON解析失敗：", text.slice(0, 100)); throw e; }
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

    let CHANGELOG = null;
    try { CHANGELOG = await loadWithFallback('Platform/tr_changelog.json'); } catch (_) {}

    // ── OpenCC ──────────────────────────────────────────────────────────────
    let simplifiedConverter = null;
    let openccLoading = false;

    async function loadOpenCC() {
        if (simplifiedConverter) return true;
        if (openccLoading) {
            await new Promise(resolve => {
                const check = setInterval(() => { if (!openccLoading) { clearInterval(check); resolve(); } }, 100);
            });
            return !!simplifiedConverter;
        }
        openccLoading = true;
        try {
            simplifiedConverter = (typeof OpenCC !== 'undefined' ? OpenCC : PAGE.OpenCC).Converter({ from: 'tw', to: 'cn' });
            return true;
        } catch (e) {
            console.warn('[D2R] OpenCC 初始化失敗：', e.message);
            return false;
        } finally { openccLoading = false; }
    }

    let toTWConverter = null;
    async function loadOpenCCReverse() {
        if (toTWConverter) return;
        const OCC = typeof OpenCC !== 'undefined' ? OpenCC : PAGE.OpenCC;
        if (!OCC) return;
        try { toTWConverter = OCC.Converter({ from: 'cn', to: 'tw' }); }
        catch (e) { console.warn('[D2R] 反向 OpenCC 建立失敗：', e.message); }
    }

    function detectBrowserLang() {
        const nav = (navigator.language || navigator.userLanguage || '').toLowerCase();
        if (nav === 'zh-cn' || nav === 'zh-hans' || nav === 'zh-sg') return 'zh-CN';
        return 'zh-TW';
    }
    function detectLang() { return CONFIG.lang !== 'auto' ? CONFIG.lang : detectBrowserLang(); }
    function applyLang(text) {
        if (!text) return text;
        if (detectLang() === 'zh-CN' && simplifiedConverter) return simplifiedConverter(text);
        return text;
    }

    // ── Config ──────────────────────────────────────────────────────────────
    const CONFIG = {
        enabled: gmGet('d2r_enabled', true),
        editBtn: gmGet('d2r_editbtn', true),
        lang:    gmGet('d2r_lang', 'auto')
    };
    function saveConfig() {
        gmSet('d2r_enabled', CONFIG.enabled);
        gmSet('d2r_editbtn', CONFIG.editBtn);
        gmSet('d2r_lang',    CONFIG.lang);
    }

    async function switchLang(lang) {
        CONFIG.lang = lang; saveConfig();
        if (detectLang() === 'zh-CN') { await loadOpenCC(); await loadOpenCCReverse(); }
        nodeCache = new WeakMap();
        document.querySelectorAll('[data-d2r-affix-translated]').forEach(el => delete el.dataset.d2rAffixTranslated);
        if (CONFIG.enabled) { processTree(document.body); document.title = applyLang(translate(document.title)); }
    }

    function hasChinese(str) { return /[\u4e00-\u9fa5]/.test(str); }

    // ── Translation data setup ───────────────────────────────────────────────
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
    function enDisplayText(enKey) { return enKey.replace(PLACEHOLDER_RE, 'X'); }

    const AFFIX_PAT = Object.entries(AFFIXES_TR).map(([en, zh]) => {
        try { return { re: buildAffixRegex(en), tmpl: buildAffixTemplate(zh) }; }
        catch (_) { return null; }
    }).filter(Boolean).sort((a, b) => b.re.source.length - a.re.source.length);

    const STRIP_PREFIX_RE = /^[\s+\-]*(?:\{\{(?:value|level|charges|duration)\}\}[\s+\-]*)*%?\s*/;
    const AFFIX_STRIPPED_PAT = (() => {
        const result = [];
        for (const [en, zh] of Object.entries(AFFIXES_TR)) {
            const enStripped = en.replace(STRIP_PREFIX_RE, '').trim();
            const zhStripped = zh.replace(STRIP_PREFIX_RE, '').trim();
            if (!enStripped || enStripped === en || !zhStripped) continue;
            try {
                const parts   = enStripped.split(PLACEHOLDER_RE);
                const escaped = parts.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
                let src = '^\\s*' + escaped[0];
                for (let i = 1; i < escaped.length; i++) src += NUM_PAT + escaped[i];
                src += '\\s*$';
                result.push({ re: new RegExp(src, 'gi'), tmpl: buildAffixTemplate(zhStripped) });
            } catch (_) {}
        }
        return result.sort((a, b) => b.re.source.length - a.re.source.length);
    })();

    const AFFIX_X_ENTRIES = Object.entries(AFFIXES_TR).map(([en, zh]) => {
        const enX = en.replace(PLACEHOLDER_RE, 'X');
        const zhX = zh.replace(PLACEHOLDER_RE, 'X');
        if (enX === zhX) return null;
        try { return { re: new RegExp(enX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), zh: zhX }; }
        catch (_) { return null; }
    }).filter(Boolean).sort((a, b) => b.re.source.length - a.re.source.length);

    function translateAffixesX(text) {
        let r = text;
        for (const { re, zh } of AFFIX_X_ENTRIES) {
            re.lastIndex = 0;
            if (re.test(r)) { re.lastIndex = 0; r = r.replace(re, zh); }
        }
        return r;
    }

    function isCreateListingCtx(node) {
        const el = node.nodeType === 3 ? node.parentElement : node;
        if (!el) return false;
        return !!el.closest('.create-listing-section, .create-listing-properties, [class*="create-listing"], [id*="create-listing"]');
    }

    const TEXT_STRIP_RE = /^([\s+\-\d.,]*%?\s*)([\s\S]*)$/;
    function translateStripped(text) {
        const m = text.match(TEXT_STRIP_RE);
        if (!m) return text;
        const body = m[2].trim();
        if (!body) return text;
        for (const { re, tmpl } of AFFIX_STRIPPED_PAT) {
            re.lastIndex = 0;
            const translated = body.replace(re, tmpl);
            if (translated !== body) return translated;
        }
        return text;
    }

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
        if (zhDisplay && hasChinese(zhDisplay) && !AFFIX_ZH_TO_EN[zhDisplay]) AFFIX_ZH_TO_EN[zhDisplay] = enDisplay;
        if (zhKeyword.length >= 2 && hasChinese(zhKeyword) && !AFFIX_ZH_TO_EN[zhKeyword]) AFFIX_ZH_TO_EN[zhKeyword] = enDisplay;
    }

    // ── 判斷是否為屬性 Min/Max 數值 input ───────────────────────────────────
    function isPropertyRangeInput(el) {
        if (!el) return false;
        if (el.id === 'property-min-input' || el.id === 'property-max-input') return true;
        if (el.closest?.('#property-min-input, #property-max-input')) return true;
        if ((el.placeholder === 'Min' || el.placeholder === 'Max') && el.closest?.('.min-max-filter-info')) return true;
        return false;
    }
    function isPropertyRangeNode(node) {
        return isPropertyRangeInput(node.nodeType === 3 ? node.parentElement : node);
    }

    // ── 翻譯核心 ────────────────────────────────────────────────────────────
    const SKIP     = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'INPUT', 'TEXTAREA']);
    let nodeCache  = new WeakMap();
    const writingSet = new WeakSet();

    function translateAffixes(text) {
        let r = text;
        for (const { re, tmpl } of AFFIX_PAT) {
            re.lastIndex = 0;
            if (re.test(r)) { re.lastIndex = 0; r = r.replace(re, tmpl); }
        }
        return translateAffixesX(r);
    }

    const MERGED_ENTRIES = [
        ...ITEM_ENTRIES.map(e => ({ entry: e, isItem: true  })),
        ...UI_ENTRIES  .map(e => ({ entry: e, isItem: false }))
    ].sort((a, b) => {
        const lenDiff = b.entry[0].length - a.entry[0].length;
        if (lenDiff !== 0) return lenDiff;
        return a.isItem ? -1 : 1;
    }).map(({ entry, isItem }) => {
        const [en, zh] = entry;
        const esc = en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re  = new RegExp(`(?<![\\w'\\-])${esc}(?![\\w'\\-])`, 'gi');
        return { entry, isItem, re };
    });

    function translate(text) {
        if (!text || !text.trim()) return text;
        const slots = [];
        const SLOT  = /\x01(\d+)\x01/g;
        let r = translateAffixes(text);
        for (const { entry, isItem, re } of MERGED_ENTRIES) {
            const [en, zh] = entry;
            if (r.toLowerCase().indexOf(en.toLowerCase()) === -1) continue;
            re.lastIndex = 0;
            r = r.replace(re, () => {
                slots.push(isItem ? `${zh}(${en})` : zh);
                return `\x01${slots.length - 1}\x01`;
            });
        }
        return r.replace(SLOT, (_, i) => slots[+i]);
    }

    function processNode(node) {
        const p = node?.parentElement;
        if (!p || SKIP.has(p.tagName)) return;
        if (p.closest('[data-d2r-affix-translated]')) return;
        if (p.closest('.messages-container')) return;
        if (isPropertyRangeNode(node)) return;

        const cur = node.textContent;
        if (!cur || !cur.trim()) return;
        if (hasChinese(cur)) return;

        let result;
        if (isCreateListingCtx(node)) {
            const affixResult = applyLang(translateAffixes(cur));
            if (affixResult !== cur) { result = affixResult; }
            else {
                const strippedResult = applyLang(translateStripped(cur));
                result = strippedResult !== cur ? strippedResult : applyLang(translate(cur));
            }
        } else {
            result = applyLang(translate(cur));
        }

        const cached = nodeCache.get(node);
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
        if (spanEl.closest('.messages-container')) return;
        const combined = spanEl.textContent.trim();
        if (!combined) return;
        const translated = applyLang(translate(combined));
        if (translated === combined) return;
        const blueSpans = spanEl.querySelectorAll('.text-theme-listing-props');
        if (blueSpans.length === 0) return;
        const redSpans = [...spanEl.querySelectorAll('.text-\\[red\\]')];
        let remaining = translated;
        redSpans.forEach((s, i) => { remaining = remaining.replace(s.textContent, `\x00${i}\x00`); });
        const textParts = remaining.split(/\x00\d+\x00/);
        blueSpans.forEach((span, i) => { if (textParts[i] !== undefined) span.textContent = textParts[i]; });
        spanEl.dataset.d2rAffixTranslated = 'true';
    }

    function processTree(root) {
        if (!root || root.nodeType !== 1) return;
        if (root.closest?.('.messages-container')) return;
        if (root.classList?.contains('messages-container')) return;

        root.querySelectorAll('.listing-num-properties > span').forEach(span => processAffixSpan(span));

        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: n => {
                if (!n.parentElement || SKIP.has(n.parentElement.tagName)) return NodeFilter.FILTER_SKIP;
                if (isPropertyRangeNode(n)) return NodeFilter.FILTER_SKIP;
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        const nodes = []; let n;
        while ((n = walker.nextNode())) nodes.push(n);
        nodes.forEach(processNode);
    }

    // ════════════════════════════════════════════════════════════════════════
    // ── OVERLAY INPUT
    // ════════════════════════════════════════════════════════════════════════

    let translationPaused = false;
    let resumeTimer       = null;

    function pauseTranslation() {
        translationPaused = true;
        clearTimeout(resumeTimer);
        resumeTimer = null;
    }

    function resumeTranslation(delay = 0) {
        clearTimeout(resumeTimer);
        resumeTimer = setTimeout(() => {
            translationPaused = false;
            resumeTimer = null;
            if (CONFIG.enabled) processTree(document.body);
        }, delay);
    }

    const overlayInput = document.createElement('input');
    overlayInput.type        = 'text';
    overlayInput.id          = 'd2r-overlay-input';
    overlayInput.inputMode   = 'numeric';
    overlayInput.autocomplete = 'off';
    overlayInput.style.cssText = [
        'position:fixed', 'z-index:9999998', 'box-sizing:border-box',
        'border:1px solid #ffffff', 'background:#000000', 'color:#fff',
        'font-size:14px', 'padding:0 6px', 'margin:0', 'outline:none',
        'border-radius:4px', 'display:none', 'pointer-events:auto'
    ].join(';');
    document.body.appendChild(overlayInput);

    let overlayTarget    = null;
    let overlayCommitted = false;

    function syncOverlayPos() {
        if (!overlayTarget) return;
        const r = overlayTarget.getBoundingClientRect();
        overlayInput.style.left   = r.left   + 'px';
        overlayInput.style.top    = r.top    + 'px';
        overlayInput.style.width  = r.width  + 'px';
        overlayInput.style.height = r.height + 'px';
    }

    function showOverlay(targetEl) {
        overlayTarget    = targetEl;
        overlayCommitted = false;
        overlayInput.value = targetEl.value;
        syncOverlayPos();
        overlayInput.style.display = 'block';
        requestAnimationFrame(() => { overlayInput.focus(); overlayInput.select(); });
        pauseTranslation();
    }

    function hideOverlay() {
        overlayInput.style.display = 'none';
        overlayTarget    = null;
        overlayCommitted = false;
    }

    function commitOverlay() {
        if (overlayCommitted || !overlayTarget) return;
        overlayCommitted = true;
        const val    = overlayInput.value;
        const target = overlayTarget;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(target, val);
        target.dispatchEvent(new Event('input',  { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // [FIX] Tab 鍵：優先在 property range inputs 之間循環，離開時才交給一般焦點管理
    // 因為頁面上所有 min/max input 的 id 全部重複，不能靠 id 定位，
    // 改用 .min-max-filter-info 裡的 placeholder=Min/Max 來抓完整清單。
    function getPropertyRangeInputs() {
        return Array.from(
            document.querySelectorAll('.min-max-filter-info input[placeholder="Min"], .min-max-filter-info input[placeholder="Max"]')
        ).filter(el => {
            const style = getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
        });
    }

    function focusNextPropertyInput(currentTarget, reverse = false) {
        const inputs = getPropertyRangeInputs();
        if (!inputs.length) return false;

        // 用元素參考直接比對（不靠 id，因為 id 重複）
        let idx = inputs.indexOf(currentTarget);
        if (idx === -1) {
            // 找不到就用座標找最近的
            const rect = currentTarget.getBoundingClientRect();
            let minDist = Infinity;
            inputs.forEach((el, i) => {
                const r = el.getBoundingClientRect();
                const d = Math.abs(r.top - rect.top) + Math.abs(r.left - rect.left);
                if (d < minDist) { minDist = d; idx = i; }
            });
        }

        const nextIdx = idx + (reverse ? -1 : 1);
        // 超出範圍就離開 property range 區域，回傳 false 讓呼叫方決定後續
        if (nextIdx < 0 || nextIdx >= inputs.length) return false;

        inputs[nextIdx].focus();
        return true;
    }

    // blur：commit → 隱藏 → 延遲恢復翻譯
    overlayInput.addEventListener('blur', e => {
        const next = e.relatedTarget;
        commitOverlay();

        if (next && isPropertyRangeInput(next)) {
            hideOverlay();
            showOverlay(next);
        } else {
            hideOverlay();
            resumeTranslation(400);
        }
    });

    // [FIX] Tab / Shift+Tab：在 property range inputs 之間循環
    // 最後一格 Tab → 跳到「套用篩選」按鈕；第一格 Shift+Tab → 同樣跳到「套用篩選」
    overlayInput.addEventListener('keydown', e => {
        if (e.key === 'Tab') {
            e.preventDefault();
            e.stopPropagation();
            commitOverlay();
            const target = overlayTarget;   // hideOverlay 會清掉，先存起來
            hideOverlay();
            resumeTranslation(200);
            setTimeout(() => {
                const moved = focusNextPropertyInput(target, e.shiftKey);
                if (!moved) {
                    // 已到達第一個或最後一個，跳到「套用篩選」按鈕
                    const applyBtn = document.getElementById('listings-apply-filters-btn')
                    || document.querySelector('[aria-label="Apply Filters"]');
                    if (applyBtn) applyBtn.focus();
                }
            }, 0);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            commitOverlay();
            hideOverlay();
            resumeTranslation(200);
        } else if (e.key === 'Escape') {
            hideOverlay();
            resumeTranslation(200);
        }
    });

    overlayInput.addEventListener('input', () => {
        const v = overlayInput.value;
        const c = v.replace(/[^\d.\-]/g, '');
        if (c !== v) overlayInput.value = c;
    });

    window.addEventListener('scroll', syncOverlayPos, true);
    window.addEventListener('resize', syncOverlayPos);

    document.addEventListener('focusin', e => {
        const el = e.target;
        if (el === overlayInput) return;

        if (el.tagName === 'INPUT' && isPropertyRangeInput(el)) {
            showOverlay(el);
            requestAnimationFrame(() => { if (document.activeElement === el) el.blur(); });
        }
    }, true);

    // ── 中文搜尋 ────────────────────────────────────────────────────────────
    let activeIndex    = -1;
    let currentResults = [];
    let currentInput   = null;
    let zhSearchTimer  = null;
    let openccReady    = false;

    const NAV_KEYS = ['ArrowUp', 'ArrowDown', 'Enter', 'Escape', 'Tab'];

    function searchZh(query, mode = 'item') {
        if (!query?.trim()) return [];
        let q = query.trim();
        if (detectLang() === 'zh-CN') {
            if (!toTWConverter) return [{ zh: '⏳ 轉換模組載入中...', en: '', loading: true }];
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
        for (const r of [...exact, ...startsWith, ...contains]) if (!seen.has(r.en)) seen.set(r.en, r);
        return [...seen.values()].slice(0, 20);
    }

    function getFieldText(el) {
        if (el.placeholder) return el.placeholder;
        const descEl = el.getAttribute('aria-describedby') ? document.getElementById(el.getAttribute('aria-describedby')) : null;
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
        if (ph.includes('option') || ph.includes('stats') || ph === 'more filters' ||
            ph === '更多篩選' || ph.includes('選項') || ph.includes('屬性')) return 'affix';
        return 'item';
    }

    const zhDropdown = document.createElement('div');
    zhDropdown.id = 'd2r-zh-dropdown';
    zhDropdown.style.display = 'none';
    document.body.appendChild(zhDropdown);

    function positionDropdown(inputEl) {
        const rect  = inputEl.getBoundingClientRect();
        const dropH = Math.min(320, currentResults.length * 40 + 60);
        zhDropdown.style.top  = (window.innerHeight - rect.bottom < dropH && rect.top > dropH)
            ? `${rect.top + window.scrollY - dropH - 4}px`
        : `${rect.bottom + window.scrollY + 4}px`;
        zhDropdown.style.left  = `${rect.left + window.scrollX}px`;
        zhDropdown.style.width = `${Math.max(rect.width, 260)}px`;
    }

    function renderDropdown(results, inputEl, mode = 'item') {
        activeIndex = -1; currentResults = results; currentInput = inputEl;
        if (!results.length) { zhDropdown.style.display = 'none'; return; }
        zhDropdown.innerHTML = '';
        if (results.length === 1 && results[0].loading) {
            const d = document.createElement('div');
            d.className = 'd2r-zh-header'; d.innerHTML = results[0].zh;
            zhDropdown.appendChild(d);
            positionDropdown(inputEl); zhDropdown.style.display = 'block'; return;
        }
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
        hint.className = 'd2r-hint'; hint.textContent = '↑↓ 選擇　Enter 確認　Esc 關閉';
        zhDropdown.appendChild(hint);
        positionDropdown(inputEl); zhDropdown.style.display = 'block';
    }

    function applySelection(en, inputEl) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(inputEl, en);
        inputEl.dispatchEvent(new Event('input',  { bubbles: true }));
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
        inputEl.focus();
        zhDropdown.style.display = 'none'; activeIndex = -1;
        let submitFired = false;
        setTimeout(() => {
            if (submitFired) return;
            const form = inputEl.closest('form');
            if (form) { submitFired = true; form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); return; }
            const container = inputEl.closest('[class*="search"], [class*="filter"], [class*="Search"], form') || inputEl.parentElement;
            const searchBtn = container?.querySelector('button[type="submit"], button[aria-label*="search" i], button[class*="search" i], [role="button"][class*="search" i], svg[class*="search" i]');
            if (searchBtn) { submitFired = true; searchBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return; }
            submitFired = true;
            inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
            inputEl.dispatchEvent(new KeyboardEvent('keyup',   { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
        }, 80);
    }

    function setActive(idx) {
        const items = zhDropdown.querySelectorAll('.d2r-item');
        items.forEach(el => el.classList.remove('active'));
        if (idx >= 0 && idx < items.length) { items[idx].classList.add('active'); items[idx].scrollIntoView({ block: 'nearest' }); }
        activeIndex = idx;
    }

    function handleZhInput(e) {
        if (!CONFIG.enabled) return;
        const el = e.target;
        if (el === overlayInput) return;
        if (el.tagName !== 'INPUT') return;
        if (el.type === 'hidden' || el.type === 'number') return;
        if (isPropertyRangeInput(el)) return;
        if (NAV_KEYS.includes(e.key)) return;
        if (/^[\d\s.\-]*$/.test(el.value)) { zhDropdown.style.display = 'none'; return; }
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

    document.addEventListener('keydown', e => {
        if (zhDropdown.style.display === 'none') return;
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(Math.min(activeIndex + 1, currentResults.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(activeIndex - 1, 0)); }
        else if (e.key === 'Enter') {
            if (activeIndex >= 0 || currentResults.length > 0) {
                if (currentResults[0]?.loading) return;
                e.preventDefault(); e.stopPropagation();
                applySelection(currentResults[Math.max(activeIndex, 0)].en, currentInput);
            }
        } else if (e.key === 'Escape') { zhDropdown.style.display = 'none'; activeIndex = -1; }
    }, true);

    document.addEventListener('click', e => {
        if (!zhDropdown.contains(e.target) && e.target !== currentInput) zhDropdown.style.display = 'none';
    });
    window.addEventListener('scroll', () => { if (zhDropdown.style.display !== 'none' && currentInput) positionDropdown(currentInput); }, true);
    window.addEventListener('resize', () => { if (zhDropdown.style.display !== 'none' && currentInput) positionDropdown(currentInput); });

    // ── 頁面判斷 ────────────────────────────────────────────────────────────
    function isListingsOrWishlist() {
        const p = location.pathname;
        if (/\/diablo2resurrected\/profile\/[^/]+\/listings\/history/.test(p)) return false;
        return /\/diablo2resurrected\/profile\/[^/]+\/(listings|wishlist)/.test(p);
    }
    function isListingDetailPage() {
        return /\/diablo2resurrected\/listing\/\d+/.test(location.pathname);
    }
    function syncEditPageClass() {
        document.body.classList.toggle('d2r-show-edit-btns', CONFIG.editBtn && isListingsOrWishlist());
    }

    function addEditButtons() {
        if (!isListingsOrWishlist()) return;
        const listings = Array.from(
            document.querySelectorAll('.listing-row[id], .col-xs-12.col-sm-6.col-md-6.fade')
        ).filter(l => !l.querySelector('.tr-edit-btn') && !l.querySelector('.react-loading-skeleton'));
        listings.forEach(listing => {
            const listingId = listing.id?.match(/(\d+)/)?.[1];
            if (!listingId) return;
            const card = listing.querySelector('.sc-eqUAAy.sc-isRoRg');
            if (!card) return;
            const btn = document.createElement('div');
            btn.className = 'tr-edit-btn';
            btn.setAttribute('aria-label', '編輯此物品');
            btn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="white" aria-hidden="true"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm18-11.5a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75L21 5.75z"/></svg>`;
            btn.addEventListener('click', e => {
                e.stopPropagation(); e.preventDefault();
                sessionStorage.setItem('d2r_auto_edit', '1');
                location.href = `https://traderie.com/diablo2resurrected/listing/${listingId}`;
            }, true);
            card.style.position = 'relative';
            card.appendChild(btn);
        });
    }

    // ── 自動編輯 ────────────────────────────────────────────────────────────
    const AE_DEBUG = false;
    function aeLog(...args) { if (AE_DEBUG) console.log('[D2R-AutoEdit]', ...args); }
    let autoEditObserver = null, autoEditTimer = null, autoEditDone = false, pendingAutoEdit = false;

    function scheduleClick(el, label) {
        aeLog('排程點擊：', label);
        requestAnimationFrame(() => {
            if (!document.contains(el)) return;
            ['mousedown', 'mouseup', 'click'].forEach(type => {
                let evt;
                try { evt = new MouseEvent(type, { bubbles: true, cancelable: true, view: PAGE }); }
                catch (_) { evt = new MouseEvent(type, { bubbles: true, cancelable: true }); }
                el.dispatchEvent(evt);
            });
            pendingAutoEdit = false; autoEditDone = true;
        });
    }

    function findEditTarget() {
        const svg = document.querySelector('#edit-listing, .listing-edit-icon');
        if (svg) return svg;
        for (const d of document.querySelectorAll('div.tooltip, [class*="tooltip"]')) {
            const tip = d.querySelector('.tooltiptext');
            if (tip && /edit\s*listing/i.test(tip.textContent)) return d.querySelector('svg, button, [role="button"]') || d;
        }
        return null;
    }

    function tryClickEdit() { const t = findEditTarget(); if (!t) return false; scheduleClick(t, t.id || t.className); return true; }

    function clearAutoEdit() {
        pendingAutoEdit = false; autoEditDone = false;
        autoEditObserver?.disconnect(); autoEditObserver = null;
        clearTimeout(autoEditTimer); autoEditTimer = null;
    }

    function startAutoEdit() {
        if (!CONFIG.editBtn) { sessionStorage.removeItem('d2r_auto_edit'); return; }
        if (!isListingDetailPage()) { if (pendingAutoEdit || autoEditObserver) clearAutoEdit(); return; }
        if (sessionStorage.getItem('d2r_auto_edit')) { sessionStorage.removeItem('d2r_auto_edit'); pendingAutoEdit = true; }
        if (!pendingAutoEdit || autoEditDone || autoEditObserver) return;
        if (tryClickEdit()) return;
        autoEditObserver = new MutationObserver(() => {
            if (!pendingAutoEdit || autoEditDone) { autoEditObserver?.disconnect(); autoEditObserver = null; clearTimeout(autoEditTimer); autoEditTimer = null; return; }
            const t = findEditTarget();
            if (t) { autoEditObserver.disconnect(); autoEditObserver = null; clearTimeout(autoEditTimer); autoEditTimer = null; scheduleClick(t, t.id || t.className); }
        });
        autoEditObserver.observe(document.body, { childList: true, subtree: true });
        autoEditTimer = setTimeout(() => clearAutoEdit(), 15000);
    }

    function resetAutoEditState() { clearAutoEdit(); }

    // ── CSS ─────────────────────────────────────────────────────────────────
    gmStyle(`
    /* [FIX] 篩選標籤文字截斷修復：允許標籤自動撐開，不裁切翻譯後的中文 */
    [class*="filter"] [class*="chip"],
    [class*="filter"] [class*="tag"],
    [class*="filter"] [class*="badge"],
    [class*="filter"] [class*="pill"],
    [class*="selected"] [class*="chip"],
    [class*="selected"] [class*="tag"],
    .sc-bdVTJa,
    [class*="filter-tag"],
    [class*="filterTag"],
    [class*="FilterTag"],
    [class*="activeFilter"],
    [class*="active-filter"] {
        max-width: none !important;
        overflow: visible !important;
        text-overflow: unset !important;
        white-space: nowrap !important;
        width: auto !important;
        min-width: 0 !important;
        flex-shrink: 0 !important;
    }

    /* [FIX] 篩選標籤的容器也要允許換行，避免整排擠出去 */
    [class*="filter"] [class*="tags"],
    [class*="filter"] [class*="chips"],
    [class*="selected-filters"],
    [class*="selectedFilters"],
    [class*="activeFilters"],
    [class*="active-filters"] {
        flex-wrap: wrap !important;
        overflow: visible !important;
    }

    #d2r-panel{position:fixed;bottom:78px;left:16px;z-index:99999;background:#120a24;border:1px solid #6a2fa0;border-radius:8px;padding:12px 14px;min-width:210px;box-shadow:0 4px 16px rgba(0,0,0,.7);color:#d4b0f0;font-size:13px;font-family:sans-serif;display:none;user-select:none;}
    #d2r-panel.open{display:block;}
    #d2r-panel h3{margin:0 0 10px;font-size:13px;color:#d4a0ff;border-bottom:1px solid #2d1456;padding-bottom:6px;display:flex;align-items:center;justify-content:space-between;}
    #d2r-panel h3 small{font-size:10px;color:#7a5a9a;font-weight:normal;}
    .d2r-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:8px;}
    .d2r-row label{cursor:pointer;color:#c0a0e0;}
    .d2r-toggle{position:relative;width:36px;height:20px;flex-shrink:0;}
    .d2r-toggle input{opacity:0;width:0;height:0;}
    .d2r-slider{position:absolute;inset:0;background:#2d1456;border:1px solid #6a2fa0;border-radius:20px;cursor:pointer;transition:background .2s;}
    .d2r-slider::before{content:'';position:absolute;width:12px;height:12px;background:#7a5a9a;border-radius:50%;top:3px;left:3px;transition:.2s;}
    .d2r-toggle input:checked+.d2r-slider{background:#6a1fa0;}
    .d2r-toggle input:checked+.d2r-slider::before{background:#d4a0ff;transform:translateX(16px);}
    .d2r-select{background:#1e0d38;border:1px solid #6a2fa0;border-radius:4px;color:#c0a0e0;font-size:12px;padding:3px 6px;cursor:pointer;outline:none;}
    .d2r-select:focus{border-color:#9b4dca;}
    #d2r-lang-status{font-size:10px;color:#7a5a9a;text-align:right;min-height:14px;margin-top:-4px;margin-bottom:4px;}
    .d2r-panel-btns{display:flex;gap:6px;margin-top:10px;padding-top:8px;border-top:1px solid #2d1456;}
    .d2r-panel-btn{flex:1;padding:5px 4px;font-size:11px;cursor:pointer;background:#1e0d38;border:1px solid #6a2fa0;border-radius:5px;color:#c0a0e0;text-align:center;transition:background .15s,color .15s;text-decoration:none;display:flex;align-items:center;justify-content:center;gap:4px;}
    .d2r-panel-btn:hover{background:#2d1456;color:#d4a0ff;}
    #d2r-modal-overlay{position:fixed;inset:0;z-index:9999999;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;padding:16px;}
    #d2r-modal{background:#120a24;border:1px solid #6a2fa0;border-radius:10px;max-width:420px;width:100%;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,.8);font-family:sans-serif;user-select:none;}
    #d2r-modal-title{padding:16px 16px 13px;font-size:16px;font-weight:700;color:#d4a0ff;border-bottom:1px solid #2d1456;flex-shrink:0;display:flex;align-items:center;justify-content:center;gap:8px;text-align:center;}
    #d2r-modal-body{padding:14px 16px;font-size:13px;color:#c0a0e0;line-height:1.7;overflow-y:auto;flex:1;user-select:text;}
    #d2r-modal-body a{color:#9b6dca;text-decoration:underline;}
    #d2r-modal-footer{padding:10px 16px 14px;border-top:1px solid #2d1456;flex-shrink:0;display:flex;align-items:center;justify-content:center;gap:8px;}
    .d2r-modal-btn-left{margin-right:auto;}
    .d2r-modal-btn{padding:7px 16px;font-size:13px;cursor:pointer;background:#1e0d38;border:1px solid #6a2fa0;border-radius:6px;color:#c0a0e0;transition:background .15s;}
    .d2r-modal-btn:hover{background:#2d1456;}
    .d2r-modal-btn-primary{background:#6a1fa0;border-color:#9b4dca;color:#fff;}
    .d2r-modal-btn-primary:hover{background:#9b4dca;}
    #d2r-zh-dropdown{position:absolute;z-index:999999;background:#1a1220;border:1px solid #6a2fa0;border-radius:6px;box-shadow:0 4px 20px rgba(0,0,0,.8);max-height:320px;overflow-y:auto;min-width:260px;font-family:sans-serif;font-size:13px;}
    #d2r-zh-dropdown .d2r-zh-header{padding:6px 12px;font-size:11px;color:#7a5a9a;border-bottom:1px solid #2d1456;display:flex;align-items:center;gap:6px;}
    #d2r-zh-dropdown .d2r-zh-header span{color:#9b4dca;font-size:13px;}
    #d2r-zh-dropdown .d2r-item{padding:8px 12px;cursor:pointer;color:#d4b0f0;display:flex;justify-content:space-between;align-items:center;gap:12px;transition:background .1s;border-bottom:1px solid #1e1030;}
    #d2r-zh-dropdown .d2r-item:last-of-type{border-bottom:none;}
    #d2r-zh-dropdown .d2r-item:hover,#d2r-zh-dropdown .d2r-item.active{background:#2d1456;}
    #d2r-zh-dropdown .d2r-item .zh{color:#fff;font-weight:500;}
    #d2r-zh-dropdown .d2r-item .en{color:#7a5a9a;font-size:11px;text-align:right;}
    #d2r-zh-dropdown .d2r-hint{padding:6px 12px 8px;color:#5a3a7a;font-size:11px;border-top:1px solid #2d1456;text-align:center;}
    .tr-edit-btn{display:none;position:absolute;top:6px;right:6px;width:26px;height:26px;background:rgba(220,50,50,0.92);border-radius:50%;align-items:center;justify-content:center;cursor:pointer;z-index:20;opacity:0.85;transition:opacity .15s,transform .15s;pointer-events:auto;}
    body.d2r-show-edit-btns .tr-edit-btn{display:flex;}
    .tr-edit-btn:hover{opacity:1;transform:scale(1.15);}
    #d2r-navbar-btn{display:flex;align-items:center;gap:5px;cursor:pointer;color:inherit;text-decoration:none;font-size:14px;margin-left:6px;padding:4px 8px;border-radius:6px;background:rgba(154,77,202,0.15);border:1px solid rgba(154,77,202,0.4);transition:background .15s,border-color .15s;white-space:nowrap;user-select:none;}
    #d2r-navbar-btn:hover{background:rgba(154,77,202,0.3);border-color:#9b4dca;}
    body.d2r-desktop #d2r-panel{top:auto;bottom:auto;left:auto;right:auto;}
    `);

    // ── Panel / Modal / Navbar ───────────────────────────────────────────────
    function positionPanelByBtn(btn, panel) {
        const r = btn.getBoundingClientRect();
        let left = r.right - 220 + window.scrollX;
        if (left < 8) left = 8;
        panel.style.left = left + 'px'; panel.style.right = 'auto';
        panel.style.top = (r.bottom + window.scrollY + 6) + 'px'; panel.style.bottom = 'auto';
    }

    function showModal({ title, html, closeTxt = '關閉', onClose, buttons } = {}) {
        document.getElementById('d2r-modal-overlay')?.remove();
        const btns = buttons || [{ txt: closeTxt, primary: true, onClick: onClose }];
        const footerHTML = btns.map((b, i) =>
                                    `<button class="d2r-modal-btn${b.primary?' d2r-modal-btn-primary':''}${b.left?' d2r-modal-btn-left':''}" data-bi="${i}">${b.txt}</button>`
                                   ).join('');
        const overlay = document.createElement('div');
        overlay.id = 'd2r-modal-overlay';
        overlay.innerHTML = `<div id="d2r-modal"><div id="d2r-modal-title">${title}</div><div id="d2r-modal-body">${html}</div><div id="d2r-modal-footer">${footerHTML}</div></div>`;
        document.body.appendChild(overlay);
        overlay.querySelectorAll('.d2r-modal-btn').forEach(el => {
            el.addEventListener('click', () => { const cb = btns[+el.dataset.bi]?.onClick; overlay.remove(); cb?.(); });
        });
        overlay.addEventListener('click', e => { if (e.target === overlay) { overlay.remove(); onClose?.(); } });
    }

    function showChangelogModal(force = false) {
        if (!CHANGELOG) return;
        const versions = Array.isArray(CHANGELOG.versions)
        ? CHANGELOG.versions
        : [{ version: CHANGELOG.version, title: CHANGELOG.title, content: CHANGELOG.content }];
        const latestVer = CHANGELOG.latest || versions[0]?.version || '';
        if (!force && gmGet('d2r_seen_ver', '') === latestVer) return;
        const markSeen = () => gmSet('d2r_seen_ver', latestVer);
        function showList() {
            const listHTML = versions.map((v, i) => `
              <div class="d2r-ver-item" data-vi="${i}" style="padding:9px 12px;cursor:pointer;border-radius:6px;display:flex;justify-content:space-between;align-items:center;background:${i===0?'rgba(106,47,160,0.2)':'transparent'};border:1px solid ${i===0?'#6a2fa0':'transparent'};margin-bottom:6px;transition:background .15s;">
                <div><span style="color:#d4a0ff;font-weight:600">${v.version}</span>${i===0?'<span style="color:#9b4dca;font-size:11px;margin-left:6px">最新</span>':''}<div style="font-size:11px;color:#7a5a9a;margin-top:2px">${v.title||''}</div></div>
                <span style="color:#6a2fa0;font-size:16px">›</span></div>`).join('');
            showModal({
                title: '📋 更新歷程',
                html: `<div style="font-size:12px;color:#7a5a9a;margin-bottom:10px">共 ${versions.length} 個版本，點擊查看詳細說明</div><div style="max-height:300px;overflow-y:auto;padding-right:4px;">${listHTML}</div>`,
                onClose: markSeen, buttons: [{ txt: '關閉', primary: true, onClick: markSeen }]
            });
            setTimeout(() => {
                document.querySelectorAll('.d2r-ver-item').forEach(el => {
                    el.addEventListener('mouseover', () => { el.style.background = 'rgba(106,47,160,0.25)'; });
                    el.addEventListener('mouseout',  () => { el.style.background = +el.dataset.vi===0?'rgba(106,47,160,0.2)':'transparent'; });
                    el.addEventListener('click', () => showDetail(+el.dataset.vi));
                });
            }, 0);
        }
        function showDetail(idx) {
            const v = versions[idx];
            showModal({
                title: `📋 ${v.title || 'v' + v.version}`,
                html: (v.content || '（無說明）').replace(/\n/g, '<br>'),
                onClose: markSeen,
                buttons: [{ txt: '← 返回', left: true, onClick: showList }, { txt: '關閉', primary: true, onClick: markSeen }]
            });
        }
        showList();
    }

    function showAboutModal() {
        const latestVer = CHANGELOG ? (CHANGELOG.latest || CHANGELOG.versions?.[0]?.version || CHANGELOG.version) : null;
        showModal({ title: '❓ 關於本插件', closeTxt: '關閉', html: `
          <div style="margin-bottom:10px"><strong style="color:#d4a0ff">⚔️ Traderie D2R 繁體中文翻譯　作者 瀧月瀨(likolisu)</strong><br><br><span style="color:#bf8cf3">功能：介面中文化 ／ 中文關鍵字搜尋 ／ 快捷編輯按鈕</span></div>
          <div style="margin-bottom:10px;font-size:12px;color:#9a7ab0;line-height:1.8">已翻譯<br>道具名稱：${ITEM_ENTRIES.length} 條<br>屬性詞綴：${AFFIX_PAT.length} 條<br>介面文字：${UI_ENTRIES.length} 條<br>搜尋（道具）：${Object.keys(ITEM_ZH_TO_EN).length} 條<br>搜尋（屬性）：${Object.keys(AFFIX_ZH_TO_EN).length} 條</div>
          <div style="font-size:12px;color:#7a5a9a"><a href="https://github.com/awdrrawd/D2R-storehouse/" target="_blank">⌨ GitHub</a><br><a href="https://greasyfork.org/zh-TW/scripts/570784-traderie-d2r-chinese-translator-supports-cn-search" target="_blank">⌨ Greasy Fork</a>${latestVer?`<br><br><span style="color:#9a7ab0">當前版本：${latestVer}</span>`:''}</div>` });
    }

    function createPanel() {
        const panel = document.createElement('div');
        panel.id = 'd2r-panel';
        const browserHint = detectBrowserLang() === 'zh-CN' ? '简体' : '繁體';
        panel.innerHTML = `
      <h3>⚔️ D2R 中文翻譯 <small>v${VERSION}</small></h3>
      <div class="d2r-row"><label for="d2r-en">啟用翻譯</label><label class="d2r-toggle"><input type="checkbox" id="d2r-en" ${CONFIG.enabled?'checked':''}><span class="d2r-slider"></span></label></div>
      <div class="d2r-row"><label for="d2r-eb" title="在 listings/wishlist 頁顯示快捷編輯按鈕">快捷編輯按鈕</label><label class="d2r-toggle"><input type="checkbox" id="d2r-eb" ${CONFIG.editBtn?'checked':''}><span class="d2r-slider"></span></label></div>
      <div class="d2r-row"><label for="d2r-lang-sel">語言</label>
        <select id="d2r-lang-sel" class="d2r-select">
          <option value="auto" ${CONFIG.lang==='auto'?'selected':''}>自動（${browserHint}）</option>
          <option value="zh-TW" ${CONFIG.lang==='zh-TW'?'selected':''}>繁體中文</option>
          <option value="zh-CN" ${CONFIG.lang==='zh-CN'?'selected':''}>简体中文</option>
        </select>
      </div>
      <div id="d2r-lang-status"></div>
      <div class="d2r-panel-btns">
        <button class="d2r-panel-btn" id="d2r-btn-about">❓ 關於</button>
        <button class="d2r-panel-btn" id="d2r-btn-log">📋 更新</button>
        <a class="d2r-panel-btn" id="d2r-btn-gh" href="https://github.com/awdrrawd/D2R-storehouse/" target="_blank"><img src="https://www.google.com/s2/favicons?domain=github.com&sz=16" width="14" height="14" style="vertical-align:middle;border-radius:2px"> GitHub</a>
      </div>`;
        document.body.appendChild(panel);
        const togglePanel = (e, anchorEl) => {
            e.stopPropagation();
            const opening = !panel.classList.contains('open');
            panel.classList.toggle('open', opening);
            if (opening && anchorEl) positionPanelByBtn(anchorEl, panel);
        };
        document.addEventListener('click', e => {
            if (!panel.contains(e.target) && !e.target.closest('#d2r-navbar-btn')) panel.classList.remove('open');
        });
        panel.querySelector('#d2r-en').addEventListener('change', e => {
            CONFIG.enabled = e.target.checked; saveConfig();
            CONFIG.enabled ? processTree(document.body) : location.reload();
        });
        panel.querySelector('#d2r-eb').addEventListener('change', e => {
            CONFIG.editBtn = e.target.checked; saveConfig(); syncEditPageClass();
        });
        const langStatus = panel.querySelector('#d2r-lang-status');
        panel.querySelector('#d2r-lang-sel').addEventListener('change', async e => {
            CONFIG.lang = e.target.value; saveConfig();
            if (detectLang() === 'zh-CN') {
                langStatus.textContent = '⏳ 載入簡體轉換模組...';
                const ok = await loadOpenCC(); await loadOpenCCReverse(); openccReady = ok;
                langStatus.textContent = ok ? '✅ 簡體模組已就緒' : '⚠️ 載入失敗，保持繁體';
                setTimeout(() => { langStatus.textContent = ''; }, 3000);
            } else { openccReady = false; langStatus.textContent = ''; }
            await switchLang(e.target.value);
        });
        panel.querySelector('#d2r-btn-about').addEventListener('click', () => { panel.classList.remove('open'); showAboutModal(); });
        panel.querySelector('#d2r-btn-log').addEventListener('click', () => { panel.classList.remove('open'); showChangelogModal(true); });
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
            btn.id = 'd2r-navbar-btn'; btn.title = 'D2R 中文翻譯';
            btn.innerHTML = `⚔️ <span style="font-size:12px">翻譯</span>`;
            btn.addEventListener('click', e => onToggle(e, btn));
            const logoBlock = document.querySelector('.sc-iHmpnF.dlcFuQ');
            if (logoBlock?.parentElement) logoBlock.parentElement.insertBefore(btn, logoBlock.nextSibling);
            else navRight.appendChild(btn);
        };
        tryInject();
        const navObs = new MutationObserver(() => { if (injected) { navObs.disconnect(); return; } tryInject(); });
        navObs.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => navObs.disconnect(), 30000);
    }

    // ── MutationObserver + 排程 ──────────────────────────────────────────────
    let routeChangeTimer   = null;
    let lastPath           = location.pathname + location.search;
    let listingDebounceTimer = null;

    function onRouteChange() {
        const cur = location.pathname + location.search;
        if (cur === lastPath) return;
        lastPath = cur;
        clearTimeout(zhSearchTimer);
        zhDropdown.style.display = 'none';
        if (overlayInput.style.display === 'block') { commitOverlay(); hideOverlay(); }
        clearTimeout(routeChangeTimer);
        routeChangeTimer = setTimeout(() => {
            routeChangeTimer = null;
            resetAutoEditState(); syncEditPageClass();
            setTimeout(() => {
                if (CONFIG.enabled) { processTree(document.body); document.title = applyLang(translate(document.title)); }
                startAutoEdit();
            }, 500);
        }, 50);
    }

    ['pushState', 'replaceState'].forEach(m => {
        const orig = history[m];
        history[m] = function (...args) { orig.apply(this, args); onRouteChange(); };
    });
    window.addEventListener('popstate', onRouteChange);

    // ── 找到節點所屬的最近 listing 卡片根元素 ─────────────────────────────────
    // listing 卡片的根是 .col-xs-12.listing-row 或 .sc-eqUAAy，用這個縮小翻譯範圍。
    function getListingRoot(node) {
        const el = node.nodeType === 1 ? node : node.parentElement;
        if (!el) return null;
        // 如果節點本身就是 listing card 或其祖先是，回傳那個 card
        const card = el.closest('.listing-row, [id^="100"]');
        if (card) return card;
        // 非卡片區域（navbar、filter bar 等）回傳 null，讓呼叫方用原始節點
        return null;
    }

    const pending    = new Set();   // 待處理根節點 Set（自動去重）
    let   rafId      = null;

    function scheduleProcess() {
        if (rafId) return;
        rafId = requestAnimationFrame(() => {
            rafId = null;
            if (translationPaused) { pending.clear(); return; }

            const batch = [...pending]; pending.clear();
            const doEdit = CONFIG.editBtn && isListingsOrWishlist();

            // [PERF] 如果待處理節點太多，不要 fallback 整個 body，
            // 而是先把它們 dedupe 到 listing card 層級再處理。
            // 這樣 50 張卡更新 → 最多只跑 50 次 processTree(card)，不跑 body。
            if (batch.length > 80) {
                // 收集受影響的 listing card
                const roots = new Set();
                let hasNonCard = false;
                for (const node of batch) {
                    const root = getListingRoot(node);
                    if (root) roots.add(root);
                    else hasNonCard = true;
                }
                if (CONFIG.enabled) {
                    // 非卡片節點（如 navbar）才需要掃整個 body，卡片各掃各的
                    if (hasNonCard) processTree(document.body);
                    else roots.forEach(r => processTree(r));
                }
                if (doEdit) addEditButtons();
                if (cardObserver && node.nodeType === 1) {
                    node.querySelectorAll?.('.listing-row').forEach(card => cardObserver.observe(card));
                }
                return;
            }

            for (const node of batch) {
                if (node.nodeType === 1) {
                    if (CONFIG.enabled) processTree(node);
                    if (doEdit) addEditButtons();
                } else if (node.nodeType === 3 && CONFIG.enabled) {
                    processNode(node);
                }
            }
        });
    }

    const observer = new MutationObserver(muts => {
        const doTranslate = CONFIG.enabled;
        const doEditBtn   = CONFIG.editBtn && isListingsOrWishlist();
        if (!doTranslate && !doEditBtn) return;
        if (translationPaused) return;

        for (const m of muts) {
            if (doTranslate && m.type === 'characterData') {
                if (writingSet.has(m.target)) continue;
                if (isPropertyRangeNode(m.target)) continue;
                nodeCache.delete(m.target);
                // [PERF] characterData 變動：改成加入 listing card 根，不加裸 TextNode
                // 這樣同一張卡的多次 characterData 會被 Set 自動合併成一次處理
                const root = getListingRoot(m.target);
                pending.add(root || m.target);
            }
            for (const node of m.addedNodes) {
                const el = node.nodeType === 1 ? node : node.parentElement;
                if (el === overlayInput) continue;
                if (el && (isPropertyRangeInput(el) || el.closest?.('.min-max-filter-info'))) continue;
                // [PERF] 加入 listing card 根，自動合併同卡多個子節點
                const root = getListingRoot(node);
                pending.add(root || node);
            }
        }
        if (pending.size) scheduleProcess();
    });

    // [PERF] fallback：改用 requestIdleCallback + 只掃未翻譯的卡片，不輪詢整個 body
    let fallbackTimer = null;

    function scheduleFallback() {
        const idleFn = () => {
            if (!translationPaused && CONFIG.enabled) {
                // 只找還沒翻譯完的卡片（沒有 data-d2r-affix-translated 子元素的）
                const untranslated = document.querySelectorAll(
                    '.listing-row:not([data-d2r-done]) .listing-num-properties > span:not([data-d2r-affix-translated])'
                );
                if (untranslated.length) {
                    // 找到包含這些 span 的 listing card，各自 processTree
                    const cards = new Set();
                    untranslated.forEach(span => {
                        const card = span.closest('.listing-row');
                        if (card) cards.add(card);
                    });
                    cards.forEach(card => processTree(card));
                }
                // 同時補翻非卡片靜態 UI（數量少，成本低）
                const staticRoots = document.querySelectorAll(
                    '#nav-container, .search-filters, .listing-header, [class*="breadcrumb"]'
                );
                staticRoots.forEach(el => processTree(el));
            }
            if (CONFIG.editBtn && isListingsOrWishlist()) addEditButtons();
            fallbackTimer = setTimeout(scheduleFallback, 3000);
        };

        if (typeof requestIdleCallback !== 'undefined') {
            fallbackTimer = setTimeout(() => requestIdleCallback(idleFn, { timeout: 2000 }), 1000);
        } else {
            fallbackTimer = setTimeout(idleFn, 1500);
        }
    }

    window.addEventListener('pagehide', () => {
        clearTimeout(fallbackTimer); clearTimeout(routeChangeTimer);
        clearTimeout(zhSearchTimer); clearTimeout(autoEditTimer);
        clearTimeout(listingDebounceTimer); clearTimeout(resumeTimer);
        autoEditObserver?.disconnect(); observer.disconnect();
    });
    // ── IntersectionObserver：只翻譯進入視口的卡片 ─────────────────────────────
    let cardObserver = null;

    function setupCardObserver() {
        if (cardObserver) cardObserver.disconnect();
        cardObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting || !CONFIG.enabled) return;
                processTree(entry.target);
                cardObserver.unobserve(entry.target); // 翻完就不再觀察
            });
        }, { rootMargin: '300px' }); // 提前 300px 預翻，滾動時不閃

        // 套用到目前所有卡片
        document.querySelectorAll('.listing-row').forEach(card => cardObserver.observe(card));
    }
    // ── Init ─────────────────────────────────────────────────────────────────
    async function init() {
        if (detectLang() === 'zh-CN') { const ok = await loadOpenCC(); await loadOpenCCReverse(); openccReady = ok; }
        createPanel(); syncEditPageClass(); addEditButtons(); startAutoEdit();
        if (CONFIG.enabled) {
            const firstScan = () => {
                processTree(document.body);
                document.title = applyLang(translate(document.title));
                setupCardObserver(); // ← 第一次掃完後，啟動 IntersectionObserver
            };
            if (typeof requestIdleCallback !== 'undefined')
                requestIdleCallback(firstScan, { timeout: 3000 });
            else
                setTimeout(firstScan, 300);
        }
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
        scheduleFallback();
        setTimeout(() => showChangelogModal(), 1200);
    }
    init();
})();
