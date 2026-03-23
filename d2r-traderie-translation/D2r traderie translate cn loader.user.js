// ==UserScript==
// @name         D2r traderie translate cn loader
// @name:zh-TW   D2R Traderie 中文翻譯
// @namespace    https://github.com/awdrrawd/D2R-storehouse
// @version      1.0
// @description  D2R Traderie 繁體中文翻譯 + 中文搜尋
// @author       瀧月瀨
// @match        https://traderie.com/diablo2resurrected*
// @match        https://*.traderie.com/diablo2resurrected/*
// @icon         https://www.google.com/s2/favicons?domain=traderie.com&sz=64
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @updateURL    https://raw.githubusercontent.com/awdrrawd/D2R-storehouse/refs/heads/main/d2r-traderie-translation/D2R_Traderie_CN_Loader.user.js
// @downloadURL  https://raw.githubusercontent.com/awdrrawd/D2R-storehouse/refs/heads/main/d2r-traderie-translation/D2R_Traderie_CN_Loader.user.js
// @supportURL   https://github.com/awdrrawd/D2R-storehouse/issues
// @run-at       document-idle
// ==/UserScript==

(async function () {
    'use strict';
    const SOURCES = [
        'https://cdn.jsdelivr.net/gh/awdrrawd/D2R-storehouse@main/d2r-traderie-translation/D2r_traderie_translation_main.user.js',
        'https://raw.githubusercontent.com/awdrrawd/D2R-storehouse/refs/heads/main/d2r-traderie-translation/D2r_traderie_translation_main.user.js',
    ];
    let code = null;
    for (const url of SOURCES) {
        try {
            const res = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-cache' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            code = await res.text();
            //console.log('[D2R Loader] ✅ 主體載入：', url);
            break;
        } catch (e) {
            console.warn('[D2R Loader] ⚠️ 來源失敗，嘗試備用：', e.message);
        }
    }

    if (!code) {
        console.error('[D2R Loader] ❌ 所有來源均失敗，請確認網路連線');
        return;
    }

    code = code.replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/m, '');

    try {
        new Function(code)();
        //console.log('[D2R Loader] ✅ 主體執行完成');
    } catch (_) {
        try {
            eval(code);
            //console.log('[D2R Loader] ✅ 主體執行完成（eval fallback）');
        } catch (e) {
            console.error('[D2R Loader] ❌ 主體執行失敗：', e.message);
        }
    }
})();
