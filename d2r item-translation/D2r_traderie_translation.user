// ==UserScript==
// @name         D2R Traderie網中文翻譯
// @namespace    https://github.com/awdrrawd/d2r-traderie-tw
// @version      1.0
// @description  將 traderie 的 D2R 頁面翻譯為繁體中文
// @author       瀧月瀨
// @match        https://traderie.com/diablo2resurrected*
// @match        https://*.traderie.com/diablo2resurrected/*
// @require      https://raw.githubusercontent.com/awdrrawd/D2R-storehouse/refs/heads/main/d2r%20item-translation/data/translations.js
// @require      https://raw.githubusercontent.com/awdrrawd/D2R-storehouse/refs/heads/main/d2r%20item-translation/data/affixes.js
// @icon         https://www.google.com/s2/favicons?domain=traderie.com&sz=64
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

/*
 * 字典更新方式：
 *   直接修改 GitHub 上的 translations.js 或 affixes.js
 *   Tampermonkey 預設會快取 @require 檔案，強制更新方法：
 *     Tampermonkey → 腳本設定 → 外部資源 → 刪除快取 → 重新載入
 *
 * GitHub 帳號建立後：
 *   把 @require 的 YOUR_GITHUB 替換成你的 GitHub 用戶名
 *   把 d2r-traderie-tw 替換成你的 repo 名稱
 */

(function () {
  'use strict';

  const ITEM_NAMES  = window.D2R_ITEM_TRANSLATIONS || {};
  const UI_NAMES    = window.D2R_UI_TRANSLATIONS   || {};
  const AFFIXES_RAW = window.D2R_AFFIXES            || [];

  // ── 設定（用 GM storage 持久化）──
  const CONFIG = {
    enabled:      GM_getValue('d2r_enabled',      true),
    showOriginal: GM_getValue('d2r_showOriginal', true),
  };
  function saveConfig() {
    GM_setValue('d2r_enabled',      CONFIG.enabled);
    GM_setValue('d2r_showOriginal', CONFIG.showOriginal);
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

    // ── 浮動控制球 ──
    GM_addStyle(`
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
      .d2r-cached{font-size:10px;color:#5a3a7a;margin-top:3px;}
    `);

  function createFAB() {
    const fab = document.createElement('div');
    fab.id = 'd2r-fab';
    fab.textContent = '⚔️';
    fab.title = 'D2R 中文翻譯';
    if (!CONFIG.enabled) fab.classList.add('off');

    const panel = document.createElement('div');
    panel.id = 'd2r-panel';

    const scriptVersion = GM_info?.script?.version ?? '1.1.0';
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
        效果詞彙 ${AFFIX_PAT.length} 條
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
    console.log(`[D2R] 物品${ITEM_ENTRIES.length} UI${UI_ENTRIES.length} 效果${AFFIX_PAT.length}`);
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init) : init();
})();
