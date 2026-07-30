// 共用 UI:小工具+modal/lightbox/進度條元件
export const $ = sel => document.querySelector(sel);

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el[k] = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null) continue;
    el.append(c.nodeType ? c : document.createTextNode(c));
  }
  return el;
}

let toastTimer;
export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2800);
}

export function setStatus(sel, msg, isErr = false) {
  const el = $(sel);
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('err', isErr);
}

// ── modal ──
// fields: [{key, label, type: 'text'|'textarea'|'select', value, options?, placeholder?}]
// 回傳 {key: value} 或 null(取消)
export function modal({ title, fields = [], confirmText = '確定', danger = false, body = null }) {
  return new Promise(resolve => {
    const dlg = h('dialog', { class: 'modal' });
    const inputs = {};
    const form = h('form', { method: 'dialog' },
      h('h3', {}, title),
      body ? h('div', { class: 'modal-body' }, body) : null,
      ...fields.map(f => {
        let input;
        if (f.type === 'textarea') input = h('textarea', { rows: 3, placeholder: f.placeholder || '' }, f.value || '');
        else if (f.type === 'select') input = h('select', {}, ...f.options.map(o => h('option', { value: o.value, selected: o.value === f.value }, o.label)));
        else input = h('input', { value: f.value || '', placeholder: f.placeholder || '' });
        inputs[f.key] = input;
        return h('label', {}, f.label, input);
      }),
      h('div', { class: 'modal-actions' },
        h('button', { type: 'button', onclick: () => { dlg.close(); resolve(null); } }, '取消'),
        h('button', { type: 'submit', class: danger ? 'danger-solid' : 'primary' }, confirmText),
      ),
    );
    form.onsubmit = e => {
      e.preventDefault();
      const out = {};
      for (const [k, el] of Object.entries(inputs)) out[k] = el.value.trim();
      dlg.close();
      resolve(out);
    };
    dlg.oncancel = () => resolve(null);
    dlg.append(form);
    document.body.append(dlg);
    dlg.addEventListener('close', () => dlg.remove());
    dlg.showModal();
    const first = Object.values(inputs)[0];
    if (first) first.focus();
  });
}

export function confirmDialog(message, confirmText = '確定') {
  return modal({ title: message, confirmText, danger: true }).then(r => r !== null);
}

// ── lightbox:看大圖+動作按鈕 ──
export function lightbox(url, actions = []) {
  const dlg = h('dialog', { class: 'lightbox' });
  dlg.append(
    h('img', { src: url, onclick: e => e.stopPropagation() }),
    h('div', { class: 'lb-actions' },
      ...actions.map(a => h('button', { class: a.primary ? 'primary' : '', onclick: () => { dlg.close(); a.onClick(); } }, a.label)),
      h('button', { onclick: () => dlg.close() }, '關閉'),
    ),
  );
  dlg.onclick = () => dlg.close();
  document.body.append(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
}

// ── 進度條 ──
export function progressBar() {
  const fill = h('div', { class: 'progress-fill' });
  const label = h('span', { class: 'progress-label' });
  const el = h('div', { class: 'progress' }, h('div', { class: 'progress-track' }, fill), label);
  return {
    el,
    set(done, total, text) {
      fill.style.width = total ? (done / total * 100) + '%' : '0%';
      label.textContent = text || `${done} / ${total}`;
    },
    hide() { el.remove(); },
  };
}

// 空狀態卡:指路,不只是空白
export function emptyState(text, actionLabel = null, onAction = null) {
  return h('div', { class: 'empty-state' },
    h('div', { class: 'empty-tone' }),
    h('p', {}, text),
    actionLabel ? h('button', { class: 'primary', onclick: onAction }, actionLabel) : null,
  );
}
