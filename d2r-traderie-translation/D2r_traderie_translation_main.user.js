// ==UserScript==
// @name               Traderie D2R Chinese Translator + Chinese search
// @name:zh-tw         D2R Traderie 中文翻譯 + 自動編輯 (支援中文搜尋)
// @name:zh-cn         D2R Traderie 中文翻译 + 自动编辑 (支援中文搜尋)
// @namespace          https://github.com/awdrrawd/D2R-storehouse
// @version            2.5.4
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
    if (typeof unsafeWindow.D2R_Traderie_CNTranslator !== 'undefined') return;
    unsafeWindow.D2R_Traderie_CNTranslator = true;
    const VERSION = '2.5.3';
    const Permissions = 0;

    // ── 必要宣告（最先定義，其他所有程式碼依賴這三個）────────────────────────
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
    // ────────────────────────────────────────────────────────────────────────

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
        enabled:   gmGet('d2r_enabled', true),
        editBtn:   gmGet('d2r_editbtn', true),
        lang:      gmGet('d2r_lang', 'auto'),
        chatSound: gmGet('d2r_chat_sound', false),
    };
    function saveConfig() {
        gmSet('d2r_enabled',    CONFIG.enabled);
        gmSet('d2r_editbtn',    CONFIG.editBtn);
        gmSet('d2r_lang',       CONFIG.lang);
        gmSet('d2r_chat_sound', CONFIG.chatSound);
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

    // [FIX v2.5.3] 舊版用 el.closest('.create-listing-section, ...') 判斷「是否在建立/編輯清單情境」，
    // 藉此決定要不要嘗試 translateStripped()（處理「屬性描述沒帶數值」的下拉選單文字）。
    // 問題：Traderie 的屬性下拉選單(react-select)一律帶 menuPortalTarget: document.body，
    // 選單本體用 ReactDOM.createPortal 直接掛在 <body> 下，跟 .create-listing-section 是平行關係，
    // closest() 永遠找不到祖先。更糟的是「編輯清單 → Edit Item Properties」彈窗本身也是整個
    // 用 createPortal 掛到 document.body（見 Wt 元件），所以就連 select 的輸入框本身也不在
    // .create-listing-section 底下，光靠 DOM 結構完全無法判斷情境。
    // 新做法：不再依賴 DOM 祖先關係，改成內容判斷 —— translateStripped() 的比對是「整段文字
    // 完全比對」（規則已用 ^...$ 錨定），不會誤傷其他句子，因此直接讓它變成全站通用的 fallback，
    // 對任何「翻譯完仍是英文、且不含數字」的節點都嘗試比對一次即可，不必知道它是否身處
    // create-listing 容器或被 Portal 傳送到哪裡去。
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

    // 翻譯結果記憶化：React 重繪會把翻好的中文打回英文，重譯時直接命中快取（一次查表），
    // 因此不必在輸入時暫停翻譯。鍵為原始英文字串、語言中性（applyLang 在外層另外處理簡繁）。
    const TRANSLATE_CACHE = new Map();
    const AFFIX_CACHE     = new Map();
    const CACHE_MAX = 6000;
    function cacheSet(cache, key, val) {
        if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value); // FIFO 淘汰最舊
        cache.set(key, val);
        return val;
    }

    function translateAffixes(text) {
        const hit = AFFIX_CACHE.get(text);
        if (hit !== undefined) return hit;
        let r = text;
        // 數值型詞綴翻譯後一定含數字；無數字的節點直接略過整輪正則掃描
        if (/\d/.test(r)) {
            for (const { re, tmpl } of AFFIX_PAT) {
                re.lastIndex = 0;
                if (re.test(r)) { re.lastIndex = 0; r = r.replace(re, tmpl); }
            }
        }
        return cacheSet(AFFIX_CACHE, text, translateAffixesX(r));
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
        return { entry, isItem, re, enLower: en.toLowerCase() };
    });

    function translate(text) {
        if (!text || !text.trim()) return text;
        const hit = TRANSLATE_CACHE.get(text);
        if (hit !== undefined) return hit;
        const slots = [];
        const SLOT  = /\x01(\d+)\x01/g;
        let r = translateAffixes(text);
        let rLower = r.toLowerCase();           // 整個節點只轉一次小寫
        for (const { entry, isItem, re, enLower } of MERGED_ENTRIES) {
            if (rLower.indexOf(enLower) === -1) continue;
            const [en, zh] = entry;
            re.lastIndex = 0;
            const before = r;
            r = r.replace(re, () => {
                slots.push(isItem ? `${zh}(${en})` : zh);
                return `\x01${slots.length - 1}\x01`;
            });
            if (r !== before) rLower = r.toLowerCase();   // 只有真的替換才重算
        }
        return cacheSet(TRANSLATE_CACHE, text, r.replace(SLOT, (_, i) => slots[+i]));
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

        // translate() 內部已經會先跑 translateAffixes()（帶數值的詞綴），
        // 再疊加道具/介面字典比對，所以這裡不需要再分兩條路走。
        let result = applyLang(translate(cur));
        if (result === cur && !/\d/.test(cur)) {
            // 一般字典沒翻到、且整段文字不含數字 → 可能是屬性下拉選單裡「尚未輸入數值」
            // 的詞綴描述（例如新增/編輯清單屬性選單、Edit Item Properties 彈窗選項列表等）。
            // 這類選單在 Traderie 前端一律透過 react-select 的 menuPortalTarget 或 modal 的
            // ReactDOM.createPortal 掛到 document.body 之外，DOM 祖先鏈跟原本頁面容器脫勾，
            // 所以不用 closest() 判斷情境，而是直接嘗試「去除開頭數值/百分比後完整比對」，
            // 對其餘一般文字影響極小（AFFIX_STRIPPED_PAT 的規則都用 ^...$ 錨定整段字串）。
            const strippedResult = applyLang(translateStripped(cur));
            if (strippedResult !== cur) result = strippedResult;
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
        let idx = inputs.indexOf(currentTarget);
        if (idx === -1) {
            const rect = currentTarget.getBoundingClientRect();
            let minDist = Infinity;
            inputs.forEach((el, i) => {
                const r = el.getBoundingClientRect();
                const d = Math.abs(r.top - rect.top) + Math.abs(r.left - rect.left);
                if (d < minDist) { minDist = d; idx = i; }
            });
        }
        const nextIdx = idx + (reverse ? -1 : 1);
        if (nextIdx < 0 || nextIdx >= inputs.length) return false;
        inputs[nextIdx].focus();
        return true;
    }

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

    overlayInput.addEventListener('keydown', e => {
        if (e.key === 'Tab') {
            e.preventDefault();
            e.stopPropagation();
            commitOverlay();
            const target = overlayTarget;
            hideOverlay();
            resumeTranslation(200);
            setTimeout(() => {
                const moved = focusNextPropertyInput(target, e.shiftKey);
                if (!moved) {
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

    // 屬性 Min/Max 輸入框：不再攔截焦點、也不在輸入時暫停翻譯。
    // 翻譯結果已記憶化（TRANSLATE_CACHE / AFFIX_CACHE），React 重繪後的重譯近乎零成本，
    // 卡片會立即還原成中文而不會停在英文；Tab/Enter 跳格交回瀏覽器原生行為。

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
        zhDropdown.style.display = 'none';
        activeIndex = -1;
        let submitFired = false;
        setTimeout(() => {
            if (submitFired) return;
            const form = inputEl.closest('form');
            if (form) {
                submitFired = true;
                form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                return;
            }
            const container = inputEl.closest('[class*="search"], [class*="filter"], [class*="Search"], form')
            || inputEl.parentElement;
            const searchBtn = container?.querySelector(
                'button[type="submit"], button[aria-label*="search" i], ' +
                'button[class*="search" i], [role="button"][class*="search" i], ' +
                'svg[class*="search" i]'
            );
            if (searchBtn) {
                submitFired = true;
                searchBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            }
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
            document.querySelectorAll('.listing-row[id]')
        ).filter(l => !l.querySelector('.tr-edit-btn') && !l.querySelector('.react-loading-skeleton'));
        listings.forEach(listing => {
            const listingId = listing.id?.match(/(\d+)/)?.[1];
            if (!listingId) return;
            const card = listing.querySelector('.sc-eqUAAy');
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

    // ════════════════════════════════════════════════════════════════════════
    function getCurrentTab() {
        const path = location.pathname;
        if (/\/wishlist/.test(path)) return 'wishlist';
        if (/\/listings/.test(path)) return 'listings';
        return null;
    }

    function getTabCards() {
        if (!getCurrentTab()) return [];
        return Array.from(document.querySelectorAll('.listing-row[id]'))
            .filter(el => el.offsetParent !== null);
    }

    function injectBatchButtons() {
        if (Permissions !== 1) return;
        if (!isListingsOrWishlist()) return;
        const actionsBar = document.querySelector('.listings-actions');
        if (!actionsBar) return;
        if (actionsBar.querySelector('#d2r-batch-relist, #d2r-batch-remove')) return;
        actionsBar.querySelectorAll('.listing-action-relist, .listing-action-remove').forEach(btn => {
            btn.style.display = 'none'; btn.dataset.d2rHidden = 'true';
        });
        const relistBtn = document.createElement('button');
        relistBtn.id = 'd2r-batch-relist'; relistBtn.className = 'app-btn'; relistBtn.type = 'button';
        relistBtn.title = '全部重新上架';
        relistBtn.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:4px;font-size:16px;background:#2f9e44;border-color:#2f9e44;color:#ededed;';
        relistBtn.textContent = '🔄上架';
        relistBtn.addEventListener('click', () => batchAction('relist', relistBtn));
        const removeBtn = document.createElement('button');
        removeBtn.id = 'd2r-batch-remove'; removeBtn.className = 'app-btn'; removeBtn.type = 'button';
        removeBtn.title = '全部移除';
        removeBtn.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:4px;font-size:16px;background:#c73b3b;border-color:#c73b3b;color:#ededed;';
        removeBtn.textContent = '🗑️刪除';
        removeBtn.addEventListener('click', () => batchAction('remove', removeBtn));
        const applyAll = actionsBar.querySelector('.listing-apply-all-properties');
        if (applyAll) { actionsBar.insertBefore(relistBtn, applyAll); actionsBar.insertBefore(removeBtn, applyAll); }
        else { actionsBar.appendChild(relistBtn); actionsBar.appendChild(removeBtn); }
    }

    async function loadAllItems(triggerBtn) {
        let rounds = 0;
        while (rounds < 30) {
            const btn = document.querySelector('.see-all-btn-bar button[aria-label="Load More"], .see-all-btn-bar button');
            if (!btn || btn.disabled) break;
            if (triggerBtn) triggerBtn.textContent = `⏳ 展開 ${rounds + 1}`;
            btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            rounds++;
            await new Promise(r => setTimeout(r, 1500));
        }
    }

    async function batchAction(type, triggerBtn) {
        const btnSel = type === 'relist' ? '.listing-action-relist' : '.remove-listing';
        const loadMoreExists = !!document.querySelector('.see-all-btn-bar button[aria-label="Load More"], .see-all-btn-bar button');
        if (loadMoreExists) {
            const choice = await new Promise(resolve => {
                showModal({
                    title: '📦 偵測到「載入更多」',
                    html: `目前清單尚未完全展開。<br><br>建議先<strong style="color:#d4a0ff">展開全部</strong>再執行批次操作，<br>否則只會操作目前已顯示的物品。`,
                    buttons: [
                        { txt: '只操作已顯示', onClick: () => resolve('partial') },
                        { txt: '展開全部再操作', primary: true, onClick: () => resolve('load') }
                    ]
                });
            });
            if (choice === 'load') {
                const origText = triggerBtn.textContent;
                triggerBtn.style.opacity = '0.5'; triggerBtn.style.pointerEvents = 'none';
                await loadAllItems(triggerBtn);
                triggerBtn.textContent = origText; triggerBtn.style.opacity = '1'; triggerBtn.style.pointerEvents = 'auto';
            }
        }
        const targets = getTabCards().map(card => card.querySelector(btnSel)).filter(Boolean);
        if (!targets.length) {
            showModal({ title: type === 'relist' ? '🔄 重新上架' : '🗑️ 全部移除', html: '找不到可操作的物品。', buttons: [{ txt: '關閉', primary: true }] });
            return;
        }
        const tab = getCurrentTab() === 'wishlist' ? '願望清單' : '販售清單';
        const actionZH = type === 'relist' ? '重新上架' : '移除';
        const emoji = type === 'relist' ? '🔄' : '🗑️';
        const confirmed = await new Promise(resolve => {
            showModal({
                title: `${emoji} 全部${actionZH}`,
                html: `確定要對 <strong style="color:#d4a0ff">${tab}</strong> 中的 <strong style="color:#d4a0ff">${targets.length}</strong> 筆物品全部${actionZH}嗎？${type === 'remove' ? '<br><br><span style="color:#ff6b6b;font-size:12px">⚠️ 此操作無法復原！</span>' : '<br><br><span style="font-size:12px;color:#7a5a9a">每筆間隔 0.8 秒，避免請求過快。</span>'}`,
                buttons: [{ txt: '取消', onClick: () => resolve(false) }, { txt: `確定${actionZH}`, primary: true, onClick: () => resolve(true) }]
            });
        });
        if (!confirmed) return;
        const origText = triggerBtn.textContent;
        triggerBtn.style.opacity = '0.5'; triggerBtn.style.pointerEvents = 'none';
        for (let i = 0; i < targets.length; i++) {
            const btn = targets[i];
            if (!document.contains(btn)) continue;
            btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            triggerBtn.title = `${emoji} ${i + 1} / ${targets.length}`;
            await new Promise(r => setTimeout(r, 800));
        }
        triggerBtn.textContent = '✅'; triggerBtn.title = `完成 ${targets.length} 筆`;
        triggerBtn.style.opacity = '1'; triggerBtn.style.pointerEvents = 'auto';
        setTimeout(() => { triggerBtn.textContent = origText; triggerBtn.title = type === 'relist' ? '全部重新上架' : '全部移除'; }, 3000);
    }
    // ════════════════════════════════════════════════════════════════════════

    // ── 聊天通知（簡化版）────────────────────────────────────────────────────
    // 策略：只在 TR 不是主控視窗時播放音效，不發系統通知，不做假 badge
    // 偵測來源：
    //   1. setupChatMsgObserver：同一聊天頁面，對方發新訊息
    //   2. badge observer：跨聊天室的新通知（badge 0→有值）
    // 條件：document.hidden || !document.hasFocus()

    let chatMsgObserver = null;
    let badgeObserver   = null;
    let notifAudio      = null;

    function isChatFocused() { return !document.hidden && document.hasFocus(); }

    function getNotifAudio() {
        if (!notifAudio) { notifAudio = new Audio('https://cdn.nookazon.com/juntos.mp3'); notifAudio.volume = 1.0; }
        return notifAudio;
    }
    function playMsgSound() {
        try { const a = getNotifAudio(); a.currentTime = 0; a.play().catch(() => {}); } catch (_) {}
    }

    function fireNotif(sender, text) {
        if (isChatFocused()) return;   // TR 是主控視窗 → 靜默
        if (CONFIG.chatSound) playMsgSound();
    }

    // ── 當前 chat 頁面 observer（偵測對方在同一聊天室發新訊息）────────────

    // ── 假 badge ────────────────────────────────────────────────────────────
    // 用途：記錄我們成功清除 badge 的次數（≠ CHANNEL 次數）
    // 計數規則：callNotifReadAllAPI() 成功一次 → fakeNotifCount++
    // 清除方式：點擊假 badge 本身，或點擊鈴鐺圖示
    // chatSound 關閉時：移除假 badge，還原 TR 原生行為

    let fakeNotifCount = 0;
    let fakeBadgeEl    = null;

    function ensureFakeBadge() {
        if (fakeBadgeEl && document.contains(fakeBadgeEl)) return;
        // 注入到桌面版 dropdown 鈴鐺（data-cy="dropdown-btn"）的 .notif-bell-icon
        const bellIcon = document.querySelector('[data-cy="dropdown-btn"] .notif-bell-icon')
                      || document.querySelector('.notif-bell-icon');
        if (!bellIcon) return;
        // 複用 TR 的 .badge class 繼承原生樣式（顏色、大小、位置）
        fakeBadgeEl = document.createElement('span');
        fakeBadgeEl.id        = 'd2r-fake-badge';
        fakeBadgeEl.className = 'badge';
        fakeBadgeEl.style.cssText = 'cursor:pointer;display:none;';
        fakeBadgeEl.title = '點擊清除未讀計數';
        fakeBadgeEl.addEventListener('click', e => {
            e.stopPropagation(); e.preventDefault();
            fakeNotifCount = 0;
            updateFakeBadge();
        }, true);
        bellIcon.appendChild(fakeBadgeEl);
        // 隱藏 TR 自己的 badge，避免兩個重疊
        bellIcon.querySelectorAll('.badge:not(#d2r-fake-badge)').forEach(b => {
            b.style.display = 'none';
            b.dataset.d2rHidden = '1';
        });
    }

    function updateFakeBadge() {
        if (fakeNotifCount > 0) {
            ensureFakeBadge();
            if (fakeBadgeEl) {
                fakeBadgeEl.textContent = fakeNotifCount > 99 ? '99+' : String(fakeNotifCount);
                fakeBadgeEl.style.display = '';
            }
        } else {
            if (fakeBadgeEl) fakeBadgeEl.style.display = 'none';
            // 還原 TR 的 badge
            document.querySelectorAll('.badge[data-d2r-hidden]').forEach(b => {
                delete b.dataset.d2rHidden;
                b.style.display = '';
            });
        }
    }

    function removeFakeBadge() {
        fakeBadgeEl?.remove(); fakeBadgeEl = null;
        fakeNotifCount = 0;
        // 還原 TR 的 badge
        document.querySelectorAll('.badge[data-d2r-hidden]').forEach(b => {
            delete b.dataset.d2rHidden;
            b.style.display = '';
        });
    }

    function setupBellClickReset() {
        const bellArea = document.querySelector('[data-cy="dropdown-btn"]');
        if (!bellArea || bellArea.dataset.d2rBellPatch) return;
        bellArea.dataset.d2rBellPatch = '1';
        bellArea.addEventListener('click', () => {
            fakeNotifCount = 0;
            updateFakeBadge();
        });
    }

    // ── badge observer：偵測真實訊息 → 播音效 → 清除 badge → 假 badge 計數 ──
    // 計數規則：每次 callNotifReadAllAPI() 成功 → fakeNotifCount++（非 CHANNEL 計數）

    let lastBadgeVal      = 0;
    let clearBadgePending = false;

    function setupBadgeObserver() {
        badgeObserver?.disconnect(); badgeObserver = null;
        const root = document.querySelector('nav, header, #nav-container, .nav-right') || document.body;
        badgeObserver = new MutationObserver(() => {
            // 忽略我們自己的假 badge
            const badge = document.querySelector(
                '.notif-bell-icon .badge:not(#d2r-fake-badge), [class*="bell"] .badge:not(#d2r-fake-badge)'
            );
            const val = parseInt(badge?.textContent?.trim() || '0', 10) || 0;
            if (val === 0) { lastBadgeVal = 0; return; }
            if (clearBadgePending) return;
            if (val > lastBadgeVal) {
                lastBadgeVal = val;
                fireNotif('Traderie', '你有未讀訊息或通知');
                clearBadgePending = true;
                setTimeout(async () => {
                    const res = await callNotifReadAllAPI();
                    // 只有 API 成功才計數（避免 CHANNEL 誤觸）
                    if (res && (res.ok || res.status === 200)) {
                        fakeNotifCount++;
                        updateFakeBadge();
                    }
                    setTimeout(() => {
                        lastBadgeVal = 0;
                        clearBadgePending = false;
                    }, 2000);
                }, 2000);
            }
        });
        badgeObserver.observe(root, {
            childList: true, subtree: true,
            characterData: true,
            attributes: true, attributeFilter: ['class']
        });
    }

    // ── 當前 chat 頁面 observer（偵測對方在同一聊天室發新訊息）────────────
    function setupChatMsgObserver() {
        chatMsgObserver?.disconnect(); chatMsgObserver = null;
        const container = document.querySelector('.messages-container');
        if (!container) return;
        const seen = new WeakSet(
            Array.from(container.querySelectorAll('div[style*="flex-start"] .message-container'))
        );
        chatMsgObserver = new MutationObserver(muts => {
            for (const m of muts) {
                for (const node of m.addedNodes) {
                    if (node.nodeType !== 1) continue;
                    const wraps = node.style?.justifyContent === 'flex-start'
                        ? [node]
                        : Array.from(node.querySelectorAll?.('div[style*="flex-start"]') ?? []);
                    for (const wrap of wraps) {
                        const msgEl = wrap.querySelector('.message-container');
                        if (msgEl && !seen.has(msgEl)) {
                            seen.add(msgEl);
                            const sender  = msgEl.querySelector('.message-user')?.textContent?.trim() || '';
                            const content = msgEl.querySelector('.message-content')?.textContent?.trim() || '';
                            fireNotif(sender, content);
                        }
                    }
                }
            }
        });
        chatMsgObserver.observe(container, { childList: true, subtree: false });
    }

    function maybeSetupChatObserver() {
        if (CONFIG.chatSound) {
            hookFetchForAuth();
            setupBadgeObserver();
            setupBellClickReset();
            if (document.querySelector('.messages-container')) setupChatMsgObserver();
        } else {
            // 關閉：移除假 badge，還原 TR 原生行為
            badgeObserver?.disconnect();   badgeObserver   = null;
            chatMsgObserver?.disconnect(); chatMsgObserver = null;
            removeFakeBadge();
        }
    }


    // ── 通知面板注入 & 全部清除 ──────────────────────────────────────────────
    // 核心策略：完全不觸發 React re-render
    //
    // 「刪一隱一」的根本原因是 TR 的 React re-render（含 react-transition-group）
    // 觸發 re-render 的方式：點 TR 的刪除按鈕 → React setState → re-render → bug
    //
    // 解法：
    //   1. 我們自己把 li 視覺隱藏（li.style.display='none'）
    //      → React 不知道 DOM 變了，不觸發 re-render，不會「隱藏一筆」
    //   2. 背景呼叫 TR 的 delete API（不觸發 React）
    //      → 伺服器真正刪除，關掉重開 dropdown 後資料正確
    //   3. auth token：hook PAGE.fetch 攔截 TR 自己發的認證請求自動捕獲

    let capturedAuthHeader = null;

    function hookFetchForAuth() {
        if (PAGE.__d2r_fetch_hooked) return;
        PAGE.__d2r_fetch_hooked = true;
        const origFetch = PAGE.fetch;
        PAGE.fetch = function (input, init = {}) {
            // 攔截 TR 自己發出的含 Authorization header 的請求，偷走 token
            const auth = init?.headers?.Authorization || init?.headers?.authorization;
            if (auth && !capturedAuthHeader) capturedAuthHeader = auth;
            return origFetch.call(this, input, init);
        };
    }

    function callNotifDeleteAPI(notifId) {
        const headers = { 'Content-Type': 'application/json' };
        if (capturedAuthHeader) headers['Authorization'] = capturedAuthHeader;
        return PAGE.fetch(
            `/api/diablo2resurrected/notifications/delete?id=${encodeURIComponent(notifId)}`,
            { method: 'DELETE', credentials: 'include', headers }
        ).catch(() => null);
    }

    // 全部已讀（清除 badge）：帶捕獲的 auth token，不需要點擊鈴鐺
    function callNotifReadAllAPI() {
        const headers = { 'Content-Type': 'application/json' };
        if (capturedAuthHeader) headers['Authorization'] = capturedAuthHeader;
        return PAGE.fetch(
            '/api/diablo2resurrected/notifications/read/all',
            { method: 'PUT', credentials: 'include', headers }
        ).catch(() => null);
    }

    // 從 React fiber 取 notification id（bundle 確認 key === i.id）
    function getNotifIdFromLi(li) {
        const key = Object.keys(li).find(k =>
            k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance')
        );
        return li[key]?.key ?? null;
    }

    // 視覺隱藏 li（不觸發 React）
    function hideLi(li) {
        li.style.display = 'none';
    }

    function injectNotifClearIntoDropdown(dropdown) {
        if (dropdown.querySelector('#d2r-notif-clear-dropdown')) return;

        // 每個刪除按鈕：攔截點擊 → 視覺隱藏 + 背景 API 刪除
        Array.from(dropdown.querySelectorAll('li.list-item')).forEach(li => {
            if (li.dataset.d2rPatch) return;
            li.dataset.d2rPatch = '1';
            const trDelDiv = li.querySelector('.tooltip > div:first-child');
            if (!trDelDiv) return;
            trDelDiv.addEventListener('click', e => {
                e.stopPropagation();
                e.preventDefault();
                hideLi(li);
                const notifId = getNotifIdFromLi(li);
                if (notifId) callNotifDeleteAPI(notifId);
            }, true); // capture：在 React #root 之前攔截
        });

        const footer = dropdown.querySelector('.notification-footer');
        if (!footer) return;
        const wrapper = document.createElement('div');
        wrapper.id = 'd2r-notif-clear-wrapper';
        wrapper.style.cssText = 'display:flex;align-items:stretch;border-top:1px solid rgba(255,255,255,0.08);';
        footer.style.borderTop = 'none'; footer.style.flex = '1';
        footer.parentNode.insertBefore(wrapper, footer);
        wrapper.appendChild(footer);
        const btn = document.createElement('button');
        btn.id = 'd2r-notif-clear-dropdown'; btn.type = 'button';
        btn.style.cssText = [
            'display:inline-flex','align-items:center','cursor:pointer',
            'color:#ff6b6b','font-size:12px','padding:0 14px',
            'background:#131416','border:none',
            'border-left:1px solid rgba(255,255,255,0.08)',
            'user-select:none','transition:background .15s','flex-shrink:0'
        ].join(';');
        btn.textContent = '🗑️ 全部清除'; btn.title = '清除所有通知';
        btn.addEventListener('mouseover', () => btn.style.background = 'rgba(255,107,107,0.1)');
        btn.addEventListener('mouseout',  () => btn.style.background = '#131416');
        btn.addEventListener('click', async e => {
            e.stopPropagation(); e.preventDefault();
            const origText = btn.textContent;
            btn.style.opacity = '0.5'; btn.style.pointerEvents = 'none';
            const items = Array.from(dropdown.querySelectorAll('li.list-item'));
            let count = 0;
            for (const li of items) {
                hideLi(li);
                count++;
                btn.title = `🗑️ ${count}`;
                const notifId = getNotifIdFromLi(li);
                if (notifId) callNotifDeleteAPI(notifId);
                await new Promise(r => setTimeout(r, 120));
            }
            btn.textContent = '✅ 清除完畢';
            btn.style.opacity = '1'; btn.style.pointerEvents = 'auto';
            setTimeout(() => { btn.textContent = origText; btn.title = '清除所有通知'; }, 2000);
        });
        wrapper.appendChild(btn);
    }

    function setupNotificationObserver() {
        hookFetchForAuth();
        const notifObserver = new MutationObserver(muts => {
            for (const m of muts) {
                for (const node of m.addedNodes) {
                    if (node.nodeType !== 1) continue;
                    const dropdown = node.classList?.contains('dropdown-menu')
                        ? node : node.querySelector?.('.dropdown-menu');
                    if (dropdown && dropdown.querySelector('li.list-item, .notification-footer')) {
                        injectNotifClearIntoDropdown(dropdown);
                    }
                }
            }
        });
        notifObserver.observe(document.body, { childList: true, subtree: true });
    }


    // ── 信封快速發信功能 ──────────────────────────────────────────────────────
    // 在 listing 頁面賣家欄位的 Report tooltip 後注入信封 SVG 按鈕
    // 點擊後開啟仿 TR 原生的 chat request modal（sc-fhzFiK ePiMpt modal-content）
    // 使用者 ID 從 #listing-seller-profile-link 的 href /profile/{id}/ 取得

    // 登入用戶 ID 快取（從 TR 導航欄的 profile 連結取得）
    let _myUserId = null;

    function getMyUserId(excludeId) {
        if (_myUserId) return _myUserId;
        // 從 TR 導航欄找「我的 profile」連結（排除賣家連結）
        for (const link of document.querySelectorAll('a[href*="/profile/"]')) {
            if (link.closest('[id="listing-seller-profile-link"], .notification-table, .sc-bpUBKd')) continue;
            const m = link.getAttribute('href')?.match(/\/profile\/(\d+)/);
            if (m && m[1] !== String(excludeId)) {
                _myUserId = m[1];
                return _myUserId;
            }
        }
        return null;
    }

    function openChatRequestModal(userId, username) {
        document.getElementById('d2r-chat-overlay')?.remove();

        const overlay = document.createElement('div');
        overlay.id = 'd2r-chat-overlay';
        overlay.className = 'modal-container slowFade';
        overlay.style.cssText = [
            'position:fixed','top:0','left:0','width:100%','height:100vh',
            'display:flex','justify-content:center','align-items:center',
            'background:rgba(0,0,0,.5)','z-index:9999999'
        ].join(';');

        // 完全仿 TR 原生 modal 結構
        overlay.innerHTML = `
        <div class="sc-fhzFiK ePiMpt modal-content" style="width:600px;max-width:90vw;background:#1e1e24;color:#e8e8e8;border:1px solid rgba(255,255,255,0.1);">
          <div class="sc-jxOSlx kpRtYY" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:nowrap;">
            <div style="font-size:20px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Request to Start A Chat with ${username}</div>
            <div id="d2r-close-chat" class="sc-lcIPJg jNEYB" style="cursor:pointer;flex-shrink:0;margin-left:12px;">
              <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 352 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
                <path d="M242.72 256l100.07-100.07c12.28-12.28 12.28-32.19 0-44.48l-22.24-22.24c-12.28-12.28-32.19-12.28-44.48 0L176 189.28 75.93 89.21c-12.28-12.28-32.19-12.28-44.48 0L9.21 111.45c-12.28 12.28-12.28 32.19 0 44.48L109.28 256 9.21 356.07c-12.28 12.28-12.28 32.19 0 44.48l22.24 22.24c12.28 12.28 32.2 12.28 44.48 0L176 322.72l100.07 100.07c12.28 12.28 32.2 12.28 44.48 0l22.24-22.24c12.28-12.28 12.28-32.19 0-44.48L242.72 256z"/>
              </svg>
            </div>
          </div>
          <div class="modal-body">
            <div>
              <div style="color:#aaa;font-size:13px;">If you have previously chatted with the user, the chat will automatically be opened. If it's your first time chatting this user, you will have to wait for the other user to approve your chat request.</div>
              <div style="margin-top:12px;font-size:13px;">Message (optional)</div>
              <textarea id="d2r-chat-msg" rows="4" maxlength="500" class="role-input"
                style="width:100%;box-sizing:border-box;margin-top:6px;background:#131416;color:#e8e8e8;border:1px solid rgba(255,255,255,0.2);border-radius:4px;padding:8px;resize:vertical;"></textarea>
            </div>
          </div>
          <div class="modal-btn-bar">
            <div style="display:flex;">
              <button id="d2r-chat-send" class="app-btn confirm-btn">Send Request</button>
            </div>
            <div id="d2r-chat-cancel" class="sc-dhKdcB gFiwtp" style="cursor:pointer;">Cancel</div>
          </div>
        </div>`;

        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        overlay.querySelector('#d2r-close-chat').addEventListener('click', close);
        overlay.querySelector('#d2r-chat-cancel').addEventListener('click', close);
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

        overlay.querySelector('#d2r-chat-send').addEventListener('click', async () => {
            const message = overlay.querySelector('#d2r-chat-msg').value.trim();
            const sendBtn = overlay.querySelector('#d2r-chat-send');
            sendBtn.disabled = true; sendBtn.textContent = '傳送中...';

            const headers = { 'Content-Type': 'application/json' };
            if (capturedAuthHeader) headers['Authorization'] = capturedAuthHeader;

            // TR 正確 body 格式（從網路攔截確認）：
            //   id = targetUserId + myUserId（字串串接）
            //   toUsername = 對方的帳號名稱
            //   message = 可選訊息
            const myId = getMyUserId(userId);
            const body = { toUsername: username };
            if (myId) body.id = `${userId}${myId}`;
            if (message) body.message = message;

            const res = await PAGE.fetch('/api/diablo2resurrected/conversations/request', {
                method: 'PUT',
                credentials: 'include',
                headers,
                body: JSON.stringify(body)
            }).catch(() => null);
            const data = await res?.json().catch(() => ({}));

            if (res?.ok) {
                // 成功：顯示成功訊息，不跳轉（跳轉後 TR 會出現「對話已關閉」提示）
                const chatTarget = _myUserId || getMyUserId(userId);
                const chatUrl = chatTarget ? `/diablo2resurrected/chat/${chatTarget}` : null;
                overlay.querySelector('.modal-body').innerHTML = `
                    <div style="text-align:center;padding:16px 0;">
                        <div style="font-size:30px;margin-bottom:12px;">✅</div>
                        <div style="font-size:15px;margin-bottom:8px;">傳送成功！</div>
                        <div style="font-size:13px;color:#aaa;line-height:1.5;">
                            若是第一次傳訊，需等待對方接受後才能繼續聊天。
                        </div>
                        ${chatUrl ? `<div style="margin-top:16px;">
                            <a href="${chatUrl}" target="_blank"
                               style="color:#9b6dca;font-size:13px;text-decoration:underline;cursor:pointer;">
                               在新分頁查看聊天記錄 →
                            </a>
                        </div>` : ''}
                    </div>`;
                // 把按鈕列換成只有「關閉」
                const bar = overlay.querySelector('.modal-btn-bar');
                bar.innerHTML = '';
                const closeBtn2 = document.createElement('div');
                closeBtn2.textContent = '關閉';
                closeBtn2.className = 'sc-dhKdcB gFiwtp';
                closeBtn2.style.cssText = 'cursor:pointer;margin-left:auto;';
                closeBtn2.addEventListener('click', close);
                bar.appendChild(closeBtn2);
            } else {
                // API 失敗：在 modal 內顯示錯誤，不做頁面跳轉
                sendBtn.disabled = false; sendBtn.textContent = 'Send Request';
                let errBox = overlay.querySelector('#d2r-chat-err');
                if (!errBox) {
                    errBox = document.createElement('div');
                    errBox.id = 'd2r-chat-err';
                    errBox.style.cssText = 'color:#ff6b6b;font-size:13px;margin-top:8px;';
                    sendBtn.closest('.modal-btn-bar').before(errBox);
                }
                const status = res?.status || '？';
                errBox.textContent = `傳送失敗（${status}）。請確認已登入，或直接前往 `;
                const link = document.createElement('a');
                link.href = `/diablo2resurrected/profile/${userId}/listings`;
                link.textContent = `${username} 的頁面`;
                link.style.color = '#9b6dca';
                errBox.appendChild(link);
                errBox.appendChild(document.createTextNode(' 點擊 Message。'));
            }
        });

        // 自動 focus textarea
        setTimeout(() => overlay.querySelector('#d2r-chat-msg')?.focus(), 50);
    }

    function addListingChatButtons() {
        // 只在 listing detail 頁面注入（/listing/{id}）
        if (!/\/diablo2resurrected\/listing\/\d+/.test(location.pathname)) return;

        const sellerLinks = document.querySelectorAll(
            '[id="listing-seller-profile-link"]:not([data-d2r-chat-injected])'
        );
        sellerLinks.forEach(sellerLink => {
            sellerLink.dataset.d2rChatInjected = '1';

            // 取得賣家 ID 和名稱
            const href     = sellerLink.getAttribute('href') || '';
            const userId   = href.match(/\/profile\/(\d+)/)?.[1];
            const username = sellerLink.getAttribute('aria-label')
                          || sellerLink.querySelector('div[style*="overflow"]')?.textContent?.trim()
                          || '';
            if (!userId) return;

            // 找到 Report tooltip 的父容器
            const container = sellerLink.closest('div[style*="display: flex"], div[style*="display:flex"]')
                           || sellerLink.parentElement;
            const reportWrap = container?.querySelector('svg.listing-report-icon')?.closest('div > div.tooltip')?.parentElement;
            if (!reportWrap) return;

            // 建立信封按鈕（仿 TR 的 tooltip 結構）
            const envWrap = document.createElement('div');
            envWrap.style.cssText = 'display:inline-flex;align-items:center;';
            envWrap.innerHTML = `
            <div class="tooltip" style="cursor:pointer;display:inline-flex;align-items:center;justify-content:center;margin-left:2px;width:20px;height:35px;">
                <svg stroke="currentColor" fill="none" stroke-width="10"
                     viewBox="0 0 200 140" height="20" width="20"
                     preserveAspectRatio="xMidYMid meet"
                     xmlns="http://www.w3.org/2000/svg"
                     class="listing-report-icon"
                     style="transition:color .15s;display:block;">
                    <rect x="10" y="20" width="180" height="100" rx="8" ry="8"
                          stroke="currentColor" stroke-width="12"/>
                    <path d="M10 30 L100 85 L190 30"
                          stroke="currentColor" stroke-width="12"/>
                    <path d="M10 120 L75 70"
                          stroke="currentColor" stroke-width="12"/>
                    <path d="M190 120 L125 70"
                          stroke="currentColor" stroke-width="12"/>
                </svg>
                <div class="tooltiptext" style="padding:5px 10px;width:auto;white-space:nowrap;">
                    傳送訊息給 ${username}
                </div>
            </div>`;

            const tooltipDiv = envWrap.querySelector('.tooltip');
            tooltipDiv.addEventListener('mouseenter', () => {
                tooltipDiv.querySelector('svg').style.color = 'var(--color-theme-listing-props, #7e9bd1)';
            });
            tooltipDiv.addEventListener('mouseleave', () => {
                tooltipDiv.querySelector('svg').style.color = '';
            });
            tooltipDiv.addEventListener('click', e => {
                e.stopPropagation(); e.preventDefault();
                openChatRequestModal(userId, username);
            });

            reportWrap.after(envWrap);
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
    [class*="filter"] [class*="chip"],[class*="filter"] [class*="tag"],[class*="filter"] [class*="badge"],[class*="filter"] [class*="pill"],[class*="selected"] [class*="chip"],[class*="selected"] [class*="tag"],.sc-bdVTJa,[class*="filter-tag"],[class*="filterTag"],[class*="FilterTag"],[class*="activeFilter"],[class*="active-filter"]{max-width:none !important;overflow:visible !important;text-overflow:unset !important;white-space:nowrap !important;width:auto !important;min-width:0 !important;flex-shrink:0 !important;}
    .listing-action-bar .app-btn{padding-left:10px !important;padding-right:10px !important;min-width:0 !important;}
    [class*="filter"] [class*="tags"],[class*="filter"] [class*="chips"],[class*="selected-filters"],[class*="selectedFilters"],[class*="activeFilters"],[class*="active-filters"]{flex-wrap:wrap !important;overflow:visible !important;}
    #d2r-batch-relist:hover{background:#2f9e44 !important;}
    /* 假 badge 樣式（不需要額外 CSS，已用 inline style 設定） */
    /* [FIX] 停用通知列表所有後代的 transition/animation
       TR 可能用 react-transition-group 在子元素加 inline class，
       用 * 選擇器加 !important 確保覆蓋，但 inline style 仍需 JS 處理 */
    .notifications-list *, .notifications-list-page *,
    .dropdown-menu .notifications-list *,
    ul.notifications-list, ul.notifications-list-page {
        transition: none !important;
        animation: none !important;
        animation-duration: 0s !important;
        animation-delay: 0s !important;
    }
    #d2r-batch-remove:hover{background:#c73b3b !important;}
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
      <div class="d2r-row"><label for="d2r-cs" title="收到訊息時播放音效（視窗未主控時）">聊天音效通知</label><label class="d2r-toggle"><input type="checkbox" id="d2r-cs" ${CONFIG.chatSound?'checked':''}><span class="d2r-slider"></span></label></div>

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

        const langStatus = panel.querySelector('#d2r-lang-status');

        panel.querySelector('#d2r-en').addEventListener('change', e => {
            CONFIG.enabled = e.target.checked; saveConfig();
            CONFIG.enabled ? processTree(document.body) : location.reload();
        });
        panel.querySelector('#d2r-eb').addEventListener('change', e => {
            CONFIG.editBtn = e.target.checked; saveConfig(); syncEditPageClass();
        });
        panel.querySelector('#d2r-cs').addEventListener('change', e => {
            CONFIG.chatSound = e.target.checked; saveConfig(); maybeSetupChatObserver();
        });

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
    let routeChangeTimer     = null;
    let lastPath             = location.pathname + location.search;
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
                injectBatchButtons();
                maybeSetupChatObserver();
                addListingChatButtons();
            }, 500);
        }, 50);
    }

    ['pushState', 'replaceState'].forEach(m => {
        const orig = history[m];
        history[m] = function (...args) { orig.apply(this, args); onRouteChange(); };
    });
    window.addEventListener('popstate', onRouteChange);

    function getListingRoot(node) {
        const el = node.nodeType === 1 ? node : node.parentElement;
        if (!el) return null;
        return el.closest('.listing-row, [id^="100"]') || null;
    }

    const pending = new Set();
    let   rafId   = null;

    function scheduleProcess() {
        if (rafId) return;
        rafId = requestAnimationFrame(() => {
            rafId = null;
            if (translationPaused) { pending.clear(); return; }
            const batch  = [...pending]; pending.clear();
            const doEdit = CONFIG.editBtn && isListingsOrWishlist();
            if (batch.length > 80) {
                const roots = new Set(); const others = [];
                for (const node of batch) {
                    const root = getListingRoot(node);
                    if (root) roots.add(root); else others.push(node);
                }
                if (CONFIG.enabled) {
                    // 只處理實際變動到的節點，絕不退回全頁重掃（避免大列表主執行緒餓死）
                    roots.forEach(r => processTree(r));
                    for (const n of others) {
                        if (n.nodeType === 1) processTree(n);
                        else if (n.nodeType === 3) processNode(n);
                    }
                }
                if (doEdit) addEditButtons();
                injectBatchButtons();
                return;
            }
            for (const node of batch) {
                if (node.nodeType === 1) {
                    if (CONFIG.enabled) processTree(node);
                    if (doEdit) addEditButtons(); injectBatchButtons();
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
                pending.add(getListingRoot(m.target) || m.target);
            }
            for (const node of m.addedNodes) {
                const el = node.nodeType === 1 ? node : node.parentElement;
                if (el === overlayInput) continue;
                if (el && (isPropertyRangeInput(el) || el.closest?.('.min-max-filter-info'))) continue;
                pending.add(getListingRoot(node) || node);
            }
        }
        if (pending.size) scheduleProcess();
    });

    let fallbackTimer = null;
    function scheduleFallback() {
        const idleFn = () => {
            if (!translationPaused && CONFIG.enabled) {
                const untranslated = document.querySelectorAll('.listing-row:not([data-d2r-done]) .listing-num-properties > span:not([data-d2r-affix-translated])');
                if (untranslated.length) {
                    const cards = new Set();
                    untranslated.forEach(span => { const card = span.closest('.listing-row'); if (card) cards.add(card); });
                    cards.forEach(card => processTree(card));
                }
                document.querySelectorAll('#nav-container, .search-filters, .listing-header, [class*="breadcrumb"]').forEach(el => processTree(el));
            }
            if (CONFIG.editBtn && isListingsOrWishlist()) {
                addEditButtons();
                setTimeout(() => addEditButtons(), 1000);
                setTimeout(() => addEditButtons(), 3000);
            }
            addListingChatButtons();
            fallbackTimer = setTimeout(scheduleFallback, 3000);
        };
        if (typeof requestIdleCallback !== 'undefined')
            fallbackTimer = setTimeout(() => requestIdleCallback(idleFn, { timeout: 2000 }), 1000);
        else
            fallbackTimer = setTimeout(idleFn, 1500);
    }

    window.addEventListener('pagehide', () => {
        clearTimeout(fallbackTimer); clearTimeout(routeChangeTimer);
        clearTimeout(zhSearchTimer); clearTimeout(autoEditTimer);
        clearTimeout(listingDebounceTimer); clearTimeout(resumeTimer);
        autoEditObserver?.disconnect(); observer.disconnect();
        chatMsgObserver?.disconnect(); badgeObserver?.disconnect();
    });

    let cardObserver = null;
    function setupCardObserver() {
        if (cardObserver) cardObserver.disconnect();
        cardObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting || !CONFIG.enabled) return;
                processTree(entry.target);
                cardObserver.unobserve(entry.target);
            });
        }, { rootMargin: '300px' });
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
                setupCardObserver();
                injectBatchButtons();
                setupNotificationObserver();
                addListingChatButtons();
            };
            if (typeof requestIdleCallback !== 'undefined')
                requestIdleCallback(firstScan, { timeout: 3000 });
            else
                setTimeout(firstScan, 300);
        }
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
        scheduleFallback();
        maybeSetupChatObserver();
        setTimeout(() => showChangelogModal(), 1200);
    }
    init();
})();
