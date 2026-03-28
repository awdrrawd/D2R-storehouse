// ==UserScript==
// @name               Traderie D2R Chinese Translator + Chinese search
// @name:zh-tw         D2R Traderie 繁體中文翻譯 + 自動編輯 (支援中文搜尋)
// @name:zh-cn         D2R Traderie 繁体中文翻译 + 自动编辑（支援中文搜尋）
// @namespace          https://github.com/awdrrawd/D2R-storehouse
// @version            2.3
// @description:zh-tw  Traderie 的 D2R 繁體中文化，支援中文搜尋，並新增快捷編輯
// @description:zh-cn  Traderie 的 D2R 繁体中文化，支援中文搜寻，并新增快捷编辑
// @author             瀧月瀨
// @match              https://traderie.com/diablo2resurrected*
// @match              https://*.traderie.com/diablo2resurrected/*
// @icon               https://www.google.com/s2/favicons?domain=traderie.com&sz=64
// @grant              GM_addStyle
// @grant              GM_getValue
// @grant              GM_setValue
// @grant              unsafeWindow
// @run-at             document-idle
// @description Traderie 的 D2R 繁體中文化，並支援中文搜尋（僅載入翻譯資料）
// @downloadURL https://update.greasyfork.org/scripts/570784/Traderie%20D2R%20Chinese%20Translator%20%2B%20Chinese%20search.user.js
// @updateURL https://update.greasyfork.org/scripts/570784/Traderie%20D2R%20Chinese%20Translator%20%2B%20Chinese%20search.meta.js
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
    const VERSION = '2.3';

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
    try { CHANGELOG = await loadWithFallback('Platform/tr_changelog.json'); } catch (_) {}

    // ── 設定 ──
    const CONFIG = {
        enabled: gmGet('d2r_enabled', true),
        editBtn: gmGet('d2r_editbtn', true)   // 編輯快捷按鈕開關
    };
    function saveConfig() {
        gmSet('d2r_enabled', CONFIG.enabled);
        gmSet('d2r_editbtn', CONFIG.editBtn);
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
    const nodeCache  = new WeakMap();
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

        const cur = node.textContent;
        if (!cur || !cur.trim()) return;
        if (hasChinese(cur)) return;

        const cached = nodeCache.get(node);
        const result = translate(cur);
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

        const combined = spanEl.textContent.trim();
        if (!combined) return;

        const translated = translate(combined);
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

        // ── 自動送出搜尋 ──
        // 策略：優先找 form submit → 再找搜尋按鈕 → 最後送 Enter keydown
        // 短暫延遲讓 React 先處理 input/change 事件，確保搜尋值已更新
        setTimeout(() => {
            // 1. input 在 form 裡 → 直接 submit
            const form = inputEl.closest('form');
            if (form) {
                form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                return;
            }

            // 2. 找附近的搜尋按鈕（涵蓋手機端的搜尋圖示按鈕）
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

            // 3. 送出 Enter keydown（PC 標準行為 + React 鍵盤事件）
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

    // 路由判斷
    function isListingsOrWishlist() {
        const p = location.pathname;
        // 排除 /listings/history，那頁不應顯示編輯按鈕
        if (/\/diablo2resurrected\/profile\/[^/]+\/listings\/history/.test(p)) return false;
        return /\/diablo2resurrected\/profile\/[^/]+\/(listings|wishlist)/.test(p);
    }
    function isListingDetailPage() {
        return /\/diablo2resurrected\/listing\/\d+/.test(location.pathname);
    }

    // 更新 body class → CSS 控制按鈕顯示/隱藏
    function syncEditPageClass() {
        // 同時滿足「開關開啟」和「在目標頁」才顯示
        document.body.classList.toggle(
            'd2r-show-edit-btns',
            CONFIG.editBtn && isListingsOrWishlist()
        );
    }

    // 建立編輯按鈕（僅建立一次，CSS 控制可見性）
    function addEditButtons() {
        if (!isListingsOrWishlist()) return; // 不在目標頁就不建立，節省資源

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

            // stopPropagation 防止觸發卡片本身的點擊事件
            // 寫入旗標，讓 listing 頁知道是由我們的按鈕跳轉過來的
            btn.addEventListener('click', e => {
                e.stopPropagation();
                e.preventDefault();
                sessionStorage.setItem('d2r_auto_edit', '1');
                location.href = `https://traderie.com/diablo2resurrected/listing/${listingId}`;
            }, true); // capture phase，確保優先於 React 事件

            card.style.position = 'relative';
            card.appendChild(btn);
        });
    }

    // ════════════════════════════════════════
    //  ★ 自動編輯模組
    // ════════════════════════════════════════

    // ── DEBUG 開關：false = 關閉 Console 日誌（正式版）──
    const AE_DEBUG = false;
    function aeLog(...args) { if (AE_DEBUG) console.log('[D2R-AutoEdit]', ...args); }

    let autoEditObserver = null;
    let autoEditTimer    = null;
    let autoEditDone     = false;

    // ★ 核心修正：把「需要自動編輯」的意圖存在 JS 記憶體，而非只靠 sessionStorage
    //   sessionStorage 讀完就可以清掉，但這個變數要一直保留到點擊成功或離開頁面
    //   重點：resetAutoEditState 不清除它，避免 SPA 二次觸發把意圖搶先抹掉
    let pendingAutoEdit  = false;

    // ── 找到編輯圖示後，等一個 rAF 再點擊 ──
    // 原因：元素進入 DOM 的瞬間 React 可能還沒掛上 onClick
    function scheduleClick(el, label) {
        aeLog(`找到編輯元素（${label}），等待下一幀後點擊：`, el);
        requestAnimationFrame(() => {
            if (!document.contains(el)) {
                aeLog('元素在 rAF 前已離開 DOM，放棄');
                return;
            }
            aeLog('開始 fireClick');
            ['mousedown', 'mouseup', 'click'].forEach(type => {
                // ★ 修正：userscript 沙箱的 window !== 頁面 window
                //   使用 PAGE（= unsafeWindow）才能通過 MouseEvent 建構子的檢查
                //   若連 PAGE 也不行就完全省略 view，讓瀏覽器用預設值
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

    // ── 尋找可點擊的編輯目標 ──
    // React 合成事件用 event.target 往上找 handler，
    // 所以必須點 SVG 本身（#edit-listing），讓事件從它往上冒泡，
    // 而不是點父層 .tooltip（那樣 React 找不到掛在 SVG 上的 onClick）
    function findEditTarget() {
        // 1. 直接回傳 SVG 本身
        const svg = document.querySelector('#edit-listing, .listing-edit-icon');
        if (svg) {
            aeLog('找到 SVG #edit-listing，直接點擊它');
            return svg;
        }

        // 2. 備用：tooltiptext 含 "Edit Listing" 的 tooltip 容器裡找 svg/button
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

    // ── 啟動自動編輯 ──
    //   A. 若 sessionStorage 有旗標 → 讀進 pendingAutoEdit，清除 sessionStorage
    //   B. 若 pendingAutoEdit = true 且還沒完成 → 繼續嘗試（即使被 reset 也不怕）
    function startAutoEdit() {
        aeLog('startAutoEdit 呼叫，路徑：', location.pathname);

        // 編輯功能關閉時清除旗標並直接返回
        if (!CONFIG.editBtn) {
            sessionStorage.removeItem('d2r_auto_edit');
            return;
        }

        if (!isListingDetailPage()) {
            // 離開 listing 頁 → 清除所有自動編輯狀態，包含 Observer
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

        // 從 sessionStorage 讀入記憶體（只需成功讀一次）
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

        // Observer 已在運行中，不重複啟動
        if (autoEditObserver) {
            aeLog('Observer 已在運行，跳過重複啟動');
            return;
        }

        aeLog('開始嘗試點擊編輯...');

        // 先試一次
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
                // ★ 立即斷開 Observer，防止 rAF 等待期間繼續重複觸發
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

    // ── 路由切換時重置（不清除 pendingAutoEdit）──
    function resetAutoEditState() {
        aeLog('resetAutoEditState（保留 pendingAutoEdit =', pendingAutoEdit, '）');
        autoEditDone = false;
        // ★ 不斷開 Observer，讓它繼續等待元素出現
        // Observer 會在 tryClickEdit 成功或 15 秒超時後自行清理
    }


    // ════════════════════════════════════════
    //  CSS（翻譯 UI + 編輯按鈕）
    // ════════════════════════════════════════

    gmStyle(`
    #d2r-fab:hover{transform:scale(1.1);}
    #d2r-fab.off{filter:grayscale(1) brightness(.4);}

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
    /* 返回按鈕靠左，其他按鈕自然在右側置中區 */
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
    `);

    // panel 定位輔助：每次開啟時根據按鈕位置重算
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

    // options.buttons = [{ txt, primary, left, onClick }]
    // left: true → 靠左（用於「返回列表」）
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

    // ── 關於 modal（含翻譯統計）──
    function showAboutModal() {
        const latestVer = CHANGELOG
        ? (CHANGELOG.latest || CHANGELOG.versions?.[0]?.version || CHANGELOG.version)
        : null;
        const html = `
          <div style="margin-bottom:10px">
            <strong style="color:#d4a0ff">⚔️ Traderie D2R 繁體中文翻譯　　　　　　作者 瀧月瀨(likolisu)</strong><br><br>
            <span style="color:#bf8cf3">功能：中文介面翻譯 ／ 中文關鍵字搜尋 ／ 快捷編輯按鈕</span>
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
    //  Navbar 注入
    // ════════════════════════════════════════

    function createPanel() {
        const panel = document.createElement('div');
        panel.id = 'd2r-panel';
        panel.innerHTML = `
  <h3>⚔️TR D2R 中文翻譯 <small>v${VERSION}</small></h3>
  <div class="d2r-row">
    <label for="d2r-en">啟用翻譯</label>
    <label class="d2r-toggle">
      <input type="checkbox" id="d2r-en" ${CONFIG.enabled ? 'checked' : ''}>
      <span class="d2r-slider"></span>
    </label>
  </div>
  <div class="d2r-row">
    <label for="d2r-eb" title="在 listings/wishlist 頁顯示快捷編輯按鈕">快捷編輯</label>
    <label class="d2r-toggle">
      <input type="checkbox" id="d2r-eb" ${CONFIG.editBtn ? 'checked' : ''}>
      <span class="d2r-slider"></span>
    </label>
  </div>
  <div class="d2r-panel-btns">
    <button class="d2r-panel-btn" id="d2r-btn-about">❓ 關於</button>
    <button class="d2r-panel-btn" id="d2r-btn-log">📋 更新</button>
    <a class="d2r-panel-btn" id="d2r-btn-gh"
       href="https://github.com/awdrrawd/D2R-storehouse/" target="_blank">
      <img src="https://www.google.com/s2/favicons?domain=github.com&sz=16"
           width="14" height="14" style="vertical-align:middle;border-radius:2px"> GitHub</a>
  </div>`;

        document.body.appendChild(panel);

        // 點擊 panel 外部關閉
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

        // 翻譯開關（移除 fab.classList 操作）
        panel.querySelector('#d2r-en').addEventListener('change', e => {
            CONFIG.enabled = e.target.checked;
            saveConfig();
            CONFIG.enabled ? processTree(document.body) : location.reload();
        });
        panel.querySelector('#d2r-eb').addEventListener('change', e => {
            CONFIG.editBtn = e.target.checked;
            saveConfig();
            syncEditPageClass();
        });
        panel.querySelector('#d2r-btn-about').addEventListener('click', () => {
            panel.classList.remove('open');
            showAboutModal();
        });
        panel.querySelector('#d2r-btn-log').addEventListener('click', () => {
            panel.classList.remove('open');
            showChangelogModal(true);
        });

        injectNavBtn(togglePanel);
    }

    // 偵測 PC navbar 並注入按鈕
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
            btn.title = 'TR D2R 中文翻譯';
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

        // 修復④：清除可能殘留的中文搜尋 debounce timer
        clearTimeout(zhSearchTimer);
        zhDropdown.style.display = 'none';

        // 重置自動編輯狀態（SPA 換頁時清乾淨）
        resetAutoEditState();

        // 更新按鈕顯示 class（立即同步）
        syncEditPageClass();

        setTimeout(() => {
            if (CONFIG.enabled) {
                processTree(document.body);
                document.title = translate(document.title);
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
        // 翻譯和編輯按鈕分開判斷，互不干擾
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

    function init() {
        createPanel();
        syncEditPageClass();
        addEditButtons();
        startAutoEdit();

        if (CONFIG.enabled) {
            processTree(document.body);
            document.title = translate(document.title);
        }
        // 無論翻譯是否開啟，Observer 都要啟動（編輯按鈕需要它）
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });

        // iOS Safari 保命輪詢（翻譯和編輯按鈕各自獨立判斷）
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

        // 版本有更新時自動彈出更新說明
        setTimeout(() => showChangelogModal(), 1200);
    }

    init();
})();
