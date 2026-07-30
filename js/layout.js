// 排版站:氣泡編輯(拖曳/雙擊 modal)。只管字的內容+大概位置;匯出在 bake.js。
import { $, h, toast, setStatus, modal, emptyState } from './ui.js';
import * as data from './data.js';
import { app, requireProject } from './app.js';

let panelStates = new Map(); // panelId -> {chosen, bubbles}

export async function refreshLayout() {
  const box = $('#ly-panels');
  if (!requireProject(box)) { $('#ly-toolbar').hidden = true; return; }
  $('#ly-toolbar').hidden = false;
  await render();
}

async function render() {
  const box = $('#ly-panels');
  if (!app.chapter) { box.replaceChildren(emptyState('還沒有章節——右上角「＋」新增。')); return; }
  const sb = await data.loadStoryboard(app.chapter);
  panelStates = new Map();
  const nodes = [];
  for (const p of sb.panels) {
    const st = await data.loadPanelState(app.chapter, p.id);
    if (!st.chosen) continue;
    panelStates.set(p.id, st);
    const url = await data.panelImageURL(app.chapter, p.id, st.chosen);
    if (!url) continue;
    nodes.push(renderPanel(p, st, url));
  }
  box.replaceChildren(...(nodes.length ? nodes : [emptyState('此章還沒有「已選定」的格圖,先到「生圖」。')]));
}

function renderPanel(p, st, url) {
  const wrap = h('div', { class: 'ly-panel', dataset: { pid: p.id } });
  wrap.append(h('span', { class: 'pnum' }, String(p.order)));
  const img = h('img', { src: url, draggable: false });
  wrap.append(img);
  img.onclick = e => {
    const r = wrap.getBoundingClientRect();
    st.bubbles.push({
      x: Math.round((e.clientX - r.left) / r.width * 100),
      y: Math.round((e.clientY - r.top) / r.height * 100),
      w: 40, type: 'speech', speaker: '', text: '雙擊編輯文字',
    });
    redrawBubbles(wrap, st);
  };
  redrawBubbles(wrap, st);
  return wrap;
}

async function editBubble(b) {
  const r = await modal({
    title: '編輯氣泡',
    fields: [
      { key: 'text', label: '文字', type: 'textarea', value: b.text },
      { key: 'speaker', label: '說話者(留空=不顯示)', value: b.speaker },
      { key: 'type', label: '類型', type: 'select', value: b.type, options: [
        { value: 'speech', label: '對白(白泡)' },
        { value: 'thought', label: '內心(虛線泡)' },
        { value: 'narration', label: '旁白(深色橫條)' },
      ] },
      { key: 'w', label: '最大寬度(%)', value: String(b.w || 40) },
    ],
    confirmText: '套用',
  });
  if (!r) return false;
  b.text = r.text;
  b.speaker = r.speaker;
  b.type = r.type;
  b.w = Math.min(90, Math.max(10, Number(r.w) || 40));
  return true;
}

function redrawBubbles(wrap, st) {
  wrap.querySelectorAll('.bubble').forEach(b => b.remove());
  st.bubbles.forEach((b, i) => {
    const el = h('div', { class: 'bubble ' + b.type },
      b.speaker && b.type !== 'narration' ? h('span', { class: 'spk' }, b.speaker) : null,
      b.text,
      h('button', { class: 'del', onclick: ev => { ev.stopPropagation(); st.bubbles.splice(i, 1); redrawBubbles(wrap, st); } }, '×'),
    );
    el.style.left = b.x + '%';
    el.style.top = b.y + '%';
    el.style.maxWidth = (b.w || 40) + '%';
    el.ondblclick = async ev => {
      ev.stopPropagation();
      if (await editBubble(b)) redrawBubbles(wrap, st);
    };
    el.onclick = ev => ev.stopPropagation();
    el.onpointerdown = ev => {
      if (ev.target.closest('.del')) return;
      ev.preventDefault();
      const r = wrap.getBoundingClientRect();
      const move = mv => {
        b.x = Math.min(100, Math.max(0, Math.round((mv.clientX - r.left) / r.width * 100)));
        b.y = Math.min(100, Math.max(0, Math.round((mv.clientY - r.top) / r.height * 100)));
        el.style.left = b.x + '%';
        el.style.top = b.y + '%';
      };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };
    wrap.append(el);
  });
}

// 從分鏡對白帶入(只補沒有氣泡的格;帶入即落檔)
$('#ly-fill').onclick = async () => {
  if (!app.chapter) return;
  const sb = await data.loadStoryboard(app.chapter);
  let filled = 0;
  for (const p of sb.panels) {
    const st = panelStates.get(p.id);
    if (!st || st.bubbles.length || !p.dialogue.length) continue;
    p.dialogue.forEach((d, i) => {
      st.bubbles.push({
        x: d.type === 'narration' ? 28 : (i % 2 ? 72 : 28),
        y: 12 + i * 16,
        w: 40, type: d.type, speaker: d.speaker === '旁白' ? '' : d.speaker, text: d.text,
      });
    });
    await data.savePanelState(app.chapter, p.id, st);
    filled += 1;
  }
  await render();
  toast(`已帶入 ${filled} 格的對白(已存檔)`);
};

$('#ly-save').onclick = async () => {
  for (const [pid, st] of panelStates) await data.savePanelState(app.chapter, pid, st);
  setStatus('#ly-status', '氣泡已儲存');
};
