// ==UserScript==
// @name         D2R Traderie Chinese Translator
// @name:zh-TW   D2R Traderie 中文翻譯
// @namespace    https://github.com/awdrrawd/D2R-storehouse
// @version      1.1.0
// @description  D2R Traderie 繁體中文翻譯 + 中文搜尋（自動更新載入器）
// @author       瀧月瀨
// @license      CC BY-ND 4.0
// @match        https://traderie.com/diablo2resurrected*
// @match        https://*.traderie.com/diablo2resurrected/*
// @icon         https://www.google.com/s2/favicons?domain=traderie.com&sz=64
// @require      https://cdn.jsdelivr.net/npm/opencc-js@1.0.5/dist/umd/full.js
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @grant        GM.xmlHttpRequest
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @connect      cdn.jsdelivr.net
// @connect      github.com
// @updateURL    https://github.com/awdrrawd/D2R-storehouse/raw/refs/heads/main/d2r-traderie-translation/D2r%20traderie%20translate%20cn%20loader.user.js
// @downloadURL  https://github.com/awdrrawd/D2R-storehouse/raw/refs/heads/main/d2r-traderie-translation/D2r%20traderie%20translate%20cn%20loader.user.js
// @supportURL   https://github.com/awdrrawd/D2R-storehouse/issues
// @run-at       document-idle
// ==/UserScript==
(async function () {
    'use strict';

    // 除錯畫面預設隱藏；面板內「除錯訊息」開關或網址加 ?d2rdebug=1 可開啟
    function __d2rDebugOn() {
        try { return /[?&]d2rdebug=1/.test(location.search) || localStorage.getItem('d2r_debug') === '1'; } catch (_) { return false; }
    }

    function __d2rDiag(t) {
        try {
            if (!__d2rDebugOn()) return;
            let box = document.getElementById('d2r-diag');
            if (!box) {
                box = document.createElement('div'); box.id = 'd2r-diag';
                box.style.cssText = 'position:fixed;left:0;bottom:0;z-index:2147483647;max-width:100%;background:rgba(0,0,0,.85);color:#9f9;font:11px/1.35 monospace;padding:4px 6px;white-space:pre-wrap;word-break:break-all';
                box.onclick = () => box.remove();
                (document.body || document.documentElement).appendChild(box);
            }
            box.textContent += t + '\n';
        } catch (_) {}
    }
    
    
    const LOADER_VERSION = '1.1.0';   // 與上方 @version 同步
    const PAGE = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
    __d2rDiag('[loader] 啟動 v' + LOADER_VERSION + ' unsafeWindow=' + typeof unsafeWindow + ' GM=' + typeof GM + ' rs=' + document.readyState);

    // 已經有主體腳本在執行（例如同時裝了 Greasy Fork 的主體版）→ 不重複下載、不重複執行
    if (PAGE.D2R_Traderie_CNTranslator) { __d2rDiag('[loader] 主體已在執行，略過'); return; }

    // 手機版看不到 console，失敗時在畫面上方顯示錯誤（點一下關閉）
    function showError(msg) {
        try {
            console.error(msg);
            if (!__d2rDebugOn()) return;
            const d = document.createElement('div');
            d.textContent = String(msg).slice(0, 400);
            d.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#b00020;color:#fff;font:12px/1.4 monospace;padding:6px 10px;white-space:pre-wrap;word-break:break-all';
            d.onclick = () => d.remove();
            (document.body || document.documentElement).appendChild(d);
        } catch (_) {}
    }


    // fetch 被頁面 CSP / CORS 擋住時，改用 GM.xmlHttpRequest（Userscripts / Tampermonkey 皆支援，不受頁面 CSP 限制）
    function gmFetchText(url) {
        return new Promise((resolve, reject) => {
            const x = (typeof GM !== 'undefined' && GM.xmlHttpRequest) ? GM.xmlHttpRequest.bind(GM)
                    : (typeof GM_xmlhttpRequest !== 'undefined' ? GM_xmlhttpRequest : null);
            if (!x) return reject(new Error('no GM xhr'));
            try {
                x({ method: 'GET', url, timeout: 15000,
                    onload: r => (r.status >= 200 && r.status < 300) ? resolve(r.responseText) : reject(new Error('HTTP ' + r.status)),
                    onerror: () => reject(new Error('xhr error')),
                    ontimeout: () => reject(new Error('xhr timeout')) });
            } catch (e) { reject(e); }
        });
    }
    async function fetchText(url) {
        const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => ctrl.abort(), 8000) : null;
        try {
            const res = await fetch(url, { cache: 'no-cache', signal: ctrl?.signal });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return await res.text();
        } catch (e) {
            return await gmFetchText(url);
        } finally { if (timer) clearTimeout(timer); }
    }

    // 最後一次成功下載的主體程式碼：所有來源都失敗（離線／GitHub 異常）時當備援
    function cacheGet() {
        try { return GM_getValue('d2r_loader_code', ''); } catch (_) {
            try { return localStorage.getItem('d2r_loader_code') || ''; } catch (_) { return ''; }
        }
    }
    function cacheSet(code) {
        try { GM_setValue('d2r_loader_code', code); } catch (_) {
            try { localStorage.setItem('d2r_loader_code', code); } catch (_) {}
        }
    }

    // ── 主體腳本 URL ──
    // REF 預設跟著 main 分支（commit 後即生效）。想「鎖定版本」避免未審核的變更直接推給所有人，
    // 可改成 release tag（例如 'v2.6.0'）或 commit SHA；branch / tag / SHA 這三種寫法 raw 與 jsDelivr 都吃。
    const REF = 'main';
    const SOURCES = [
        `https://raw.githubusercontent.com/awdrrawd/D2R-storehouse/${REF}/d2r-traderie-translation/D2r_traderie_translation_main.user.js`,
        `https://cdn.jsdelivr.net/gh/awdrrawd/D2R-storehouse@${REF}/d2r-traderie-translation/D2r_traderie_translation_main.user.js`,
    ];

    // ── 載入主體 ──
    let code = null;
    for (const url of SOURCES) {
        try {
            code = await fetchText(`${url}?t=${Date.now()}`);
            console.log('[D2R Loader] ✅ 主體載入：', url);
            __d2rDiag('[loader] 主體下載成功 ' + Math.round(code.length/1024) + 'KB');
            break;
        } catch (e) {
            console.warn('[D2R Loader] ⚠️ 來源失敗，嘗試備用：', e.message);
        }
    }

    // 簡單完整性檢查：確實是主體腳本（避免把錯誤頁／空白頁當程式碼執行，並且只有通過才寫入快取）
    const looksLikeMain = c => typeof c === 'string' && c.length > 20000 && c.includes('D2R_Traderie_CNTranslator');
    if (code && !looksLikeMain(code)) { console.warn('[D2R Loader] ⚠️ 下載內容不像主體腳本，改用快取'); code = null; }
    if (code) cacheSet(code);
    else {
        const cached = cacheGet();
        if (looksLikeMain(cached)) { code = cached; __d2rDiag('[loader] 使用本機快取的主體'); }
    }

    if (!code) {
        showError('[D2R Loader] 所有來源均失敗，且沒有本機快取，請確認網路連線（或頁面 CSP 擋住 fetch）');
        return;
    }

    code = code.replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/m, '');
    
    try {
        __d2rDiag('[loader] 開始執行主體');
        new Function(code)();
        console.log('[D2R Loader] ✅ 主體執行完成');
    } catch (_) {
        try {
            eval(code);
            console.log('[D2R Loader] ✅ 主體執行完成（eval fallback）');
        } catch (e) {
            showError('[D2R Loader] 主體執行失敗：' + e.message);
        }
    }
})();
