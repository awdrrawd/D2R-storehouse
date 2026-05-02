// ==UserScript==
// @name         dropcalc.silospen — Item Search Expand
// @name:zh-TW   dropcalc.silospen — 物品搜尋擴展
// @namespace    https://github.com/awdrrawd
// @version      1.0.0
// @description  Enhances the item dropdown on dropcalc.silospen.com with a searchable combobox. Type to filter, press ✕ to clear.
// @description:zh-TW  擴展 dropcalc.silospen.com 的物品搜尋功能，將下拉選單改為可輸入搜尋的 combobox，輸入即過濾，右側 ✕ 清除。
// @author       awdrrawd
// @license      CC BY-ND 4.0
// @homepageURL  https://github.com/awdrrawd/D2R-storehouse
// @supportURL   https://github.com/awdrrawd/D2R-storehouse/issues
// @downloadURL  https://raw.githubusercontent.com/awdrrawd/D2R-storehouse/main/other/dropcalc.silospen%20%E2%80%94%20Item%20Search%20Expand.user.js
// @updateURL    https://raw.githubusercontent.com/awdrrawd/D2R-storehouse/main/other/dropcalc.silospen%20%E2%80%94%20Item%20Search%20Expand.user.js
// @match        https://dropcalc.silospen.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------
  const style = document.createElement('style');
  style.textContent = `
    /* Hide the original <select> but keep it in the DOM for site logic */
    #item-fields-item {
      display: none !important;
    }

    /* Combobox wrapper — relative so the dropdown can be absolute inside */
    #d2-combo-wrap {
      position: relative;
      display: flex;
      align-items: center;
      width: 100%;
    }

    /* Text input — right padding leaves room for the ✕ button */
    #d2-combo-input {
      flex: 1;
      min-width: 0;
      width: 100%;
      padding: 5px 28px 5px 10px;
      border: 1px solid var(--bs-border-color, #ced4da);
      border-radius: 6px;
      background: var(--bs-body-bg, #fff);
      color: var(--bs-body-color, #212529);
      font-size: 0.875rem;
      outline: none;
      transition: border-color .15s, box-shadow .15s;
    }

    #d2-combo-input:focus {
      border-color: #e67e22;
      box-shadow: 0 0 0 3px rgba(230,126,34,.18);
    }

    /* ✕ clear button — positioned inside the right edge of the input */
    #d2-combo-clear {
      position: absolute;
      right: 6px;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      cursor: pointer;
      color: var(--bs-secondary-color, #999);
      font-size: 0.82rem;
      line-height: 1;
      padding: 2px 3px;
      border-radius: 3px;
      display: none;
      transition: color .12s, background .12s;
    }

    #d2-combo-clear:hover {
      color: var(--bs-body-color, #212529);
      background: var(--bs-secondary-bg, #e9ecef);
    }

    /* Dropdown list */
    #d2-combo-list {
      display: none;
      position: absolute;
      top: calc(100% + 3px);
      left: 0;
      right: 0;
      z-index: 9999;
      max-height: 260px;
      overflow-y: auto;
      border: 1px solid var(--bs-border-color, #ced4da);
      border-radius: 6px;
      background: var(--bs-body-bg, #fff);
      box-shadow: 0 4px 16px rgba(0,0,0,.15);
      padding: 3px 0;
    }

    #d2-combo-list.open {
      display: block;
    }

    .d2-combo-option {
      padding: 6px 12px;
      font-size: 0.875rem;
      color: var(--bs-body-color, #212529);
      cursor: pointer;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      transition: background .08s;
    }

    /* Hover / keyboard-active state */
    .d2-combo-option:hover,
    .d2-combo-option.active {
      background: var(--bs-secondary-bg, #f0f0f0);
    }

    /* Currently selected item */
    .d2-combo-option.selected {
      font-weight: 600;
      color: #e67e22;
    }

    /* Highlighted match characters */
    .d2-combo-option mark {
      background: transparent;
      color: #e67e22;
      font-weight: 700;
      padding: 0;
    }

    /* "No results" message */
    .d2-combo-empty {
      padding: 8px 12px;
      font-size: 0.82rem;
      color: var(--bs-secondary-color, #888);
      font-style: italic;
    }
  `;
  document.head.appendChild(style);

  // ---------------------------------------------------------------------------
  // Wait for #item-fields-item to appear (the page renders it dynamically)
  // ---------------------------------------------------------------------------
  function waitForSelect(cb) {
    const sel = document.getElementById('item-fields-item');
    if (sel) { cb(sel); return; }
    const mo = new MutationObserver(() => {
      const s = document.getElementById('item-fields-item');
      if (s) { mo.disconnect(); cb(s); }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  // ---------------------------------------------------------------------------
  // Build the combobox
  // ---------------------------------------------------------------------------
  function buildCombo(sel) {
    let allOptions = readOptions(sel);

    function readOptions(s) {
      return Array.from(s.options).map(o => ({ value: o.value, text: o.text }));
    }

    // --- Build DOM ---
    const wrap = document.createElement('div');
    wrap.id = 'd2-combo-wrap';

    const input = document.createElement('input');
    input.id = 'd2-combo-input';
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-haspopup', 'listbox');
    input.setAttribute('aria-expanded', 'false');

    const clearBtn = document.createElement('button');
    clearBtn.id = 'd2-combo-clear';
    clearBtn.type = 'button';
    clearBtn.title = 'Clear / 清除';
    clearBtn.textContent = '✕';
    clearBtn.tabIndex = -1; // Focusable for relatedTarget detection, but skipped by Tab

    const list = document.createElement('div');
    list.id = 'd2-combo-list';
    list.setAttribute('role', 'listbox');

    wrap.appendChild(input);
    wrap.appendChild(clearBtn);
    wrap.appendChild(list);

    sel.parentElement.insertBefore(wrap, sel);

    // --- State ---
    let activeIdx = -1;
    let isOpen = false;

    // --- Helpers ---
    function updateClear() {
      clearBtn.style.display = input.value ? 'inline-block' : 'none';
    }

    function syncFromSelect() {
      const cur = sel.options[sel.selectedIndex];
      input.value = cur ? cur.text : '';
      input.title = cur ? cur.text : '';
      updateClear();
    }
    syncFromSelect();

    function esc(str) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // --- Render filtered list ---
    function renderList(q) {
      const query = q.trim().toLowerCase();
      list.innerHTML = '';
      activeIdx = -1;

      const matched = allOptions.filter(o =>
        !query || o.text.toLowerCase().includes(query)
      );

      if (!matched.length) {
        const empty = document.createElement('div');
        empty.className = 'd2-combo-empty';
        empty.textContent = 'No results / 沒有符合的物品';
        list.appendChild(empty);
        return;
      }

      matched.forEach((opt) => {
        const item = document.createElement('div');
        item.className = 'd2-combo-option';
        item.dataset.value = opt.value;
        if (opt.value === sel.value) item.classList.add('selected');

        if (query) {
          const lo = opt.text.toLowerCase();
          const pos = lo.indexOf(query);
          item.innerHTML = pos >= 0
            ? esc(opt.text.slice(0, pos))
              + '<mark>' + esc(opt.text.slice(pos, pos + query.length)) + '</mark>'
              + esc(opt.text.slice(pos + query.length))
            : esc(opt.text);
        } else {
          item.textContent = opt.text;
        }

        item.addEventListener('mousedown', (e) => {
          e.preventDefault(); // Prevent input blur before click fires
          selectValue(opt.value, opt.text);
        });

        list.appendChild(item);
      });
    }

    // --- Select a value and sync back to the hidden <select> ---
    function selectValue(value, text) {
      sel.value = value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      input.value = text;
      input.title = text;
      updateClear();
      closeList();
    }

    // --- Open / close ---
    function openList(q) {
      renderList(q);
      list.classList.add('open');
      input.setAttribute('aria-expanded', 'true');
      isOpen = true;
      requestAnimationFrame(() => {
        const selectedEl = list.querySelector('.selected');
        if (selectedEl) selectedEl.scrollIntoView({ block: 'nearest' });
      });
    }

    function closeList() {
      list.classList.remove('open');
      input.setAttribute('aria-expanded', 'false');
      isOpen = false;
      activeIdx = -1;
    }

    // --- Keyboard cursor ---
    function moveCursor(dir) {
      const items = list.querySelectorAll('.d2-combo-option[data-value]');
      if (!items.length) return;
      items[activeIdx]?.classList.remove('active');
      if (activeIdx === -1) {
        // First move: ↓ jumps to first item, ↑ does nothing
        activeIdx = dir > 0 ? 0 : -1;
      } else {
        activeIdx = Math.max(0, Math.min(items.length - 1, activeIdx + dir));
      }
      if (activeIdx === -1) return;
      items[activeIdx].classList.add('active');
      items[activeIdx].scrollIntoView({ block: 'nearest' });
    }

    // --- Events ---
    input.addEventListener('focus', () => openList(input.value));

    input.addEventListener('input', () => {
      updateClear();
      openList(input.value);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!isOpen) openList(input.value);
        moveCursor(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveCursor(-1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (!isOpen) return;
        const active = list.querySelector('.d2-combo-option.active');
        const target = active || list.querySelector('.d2-combo-option[data-value]');
        if (target) {
          const opt = allOptions.find(o => o.value === target.dataset.value);
          if (opt) selectValue(opt.value, opt.text);
        }
      } else if (e.key === 'Escape') {
        syncFromSelect();
        closeList();
      } else if (e.key === 'Tab') {
        closeList();
      }
    });

    input.addEventListener('blur', (e) => {
      // If focus moved to ✕, let clearBtn's click handler take over
      if (e.relatedTarget === clearBtn) return;
      setTimeout(() => {
        if (!isOpen) return;
        syncFromSelect();
        closeList();
      }, 160);
    });

    clearBtn.addEventListener('click', () => {
      input.value = '';
      updateClear();
      input.focus();
      openList('');
    });

    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target)) closeList();
    });

    // Re-cache options when quality / version dropdowns change the <select> contents
    const moOpts = new MutationObserver(() => {
      allOptions = readOptions(sel);
      syncFromSelect();
      if (isOpen) renderList(input.value);
    });
    moOpts.observe(sel, { childList: true });

    ['item-fields-item-quality', 'item-fields-item-version'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', () => {
          input.value = '';
          updateClear();
          closeList();
        });
      }
    });
  }

  waitForSelect(buildCombo);
})();
