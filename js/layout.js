// 排版匯出站:氣泡編輯+匯出 PWA 電子書
import { $, h, toast, setStatus } from './ui.js';
import * as store from './store.js';
import * as data from './data.js';
import { buildReaderFiles } from './export.js';
import { app } from './app.js';

let dir = null;
let panelStates = new Map(); // panelId -> {chosen, bubbles}

export async function refreshLayout() {
  const chapters = await data.listChapters();
  const sel = $('#ly-chapter');
  sel.replaceChildren(...chapters.map(c => h('option', { value: c.dir, selected: c.dir === dir }, `${c.dir} ${c.title}`)));
  sel.onchange = render;
  if (!dir && chapters.length) dir = chapters[0].dir;
  if (dir) { sel.value = dir; await render(); }
}

async function render() {
  dir = $('#ly-chapter').value;
  const sb = await data.loadStoryboard(dir);
  panelStates = new Map();
  const box = $('#ly-panels');
  const nodes = [];
  for (const p of sb.panels) {
    const st = await data.loadPanelState(dir, p.id);
    if (!st.chosen) continue;
    panelStates.set(p.id, st);
    const url = await data.panelImageURL(dir, p.id, st.chosen);
    if (!url) continue;
    nodes.push(renderPanel(p, st, url));
  }
  box.replaceChildren(...(nodes.length ? nodes : [h('p', { class: 'hint' }, '此章還沒有「已選定」的格圖,先到生圖站選定。')]));
}

function renderPanel(p, st, url) {
  const wrap = h('div', { class: 'ly-panel', dataset: { pid: p.id } });
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

function redrawBubbles(wrap, st) {
  wrap.querySelectorAll('.bubble').forEach(b => b.remove());
  st.bubbles.forEach((b, i) => {
    const el = h('div', { class: 'bubble ' + b.type },
      b.speaker && b.type !== 'narration' ? h('span', { class: 'spk' }, b.speaker) : null,
      b.text,
      h('button', { class: 'del', onclick: ev => { ev.stopPropagation(); st.bubbles.splice(i, 1); redrawBubbles(wrap, st); } }, '×'),
      h('select', { class: 'btype', onclick: ev => ev.stopPropagation(), onchange: ev => { b.type = ev.target.value; redrawBubbles(wrap, st); } },
        h('option', { value: 'speech', selected: b.type === 'speech' }, '對白'),
        h('option', { value: 'thought', selected: b.type === 'thought' }, '內心'),
        h('option', { value: 'narration', selected: b.type === 'narration' }, '旁白'),
      ),
    );
    el.style.left = b.x + '%';
    el.style.top = b.y + '%';
    el.style.maxWidth = (b.w || 40) + '%';
    el.ondblclick = ev => {
      ev.stopPropagation();
      const text = prompt('文字?', b.text);
      if (text != null) b.text = text;
      if (b.type !== 'narration') {
        const spk = prompt('說話者?(留空=不顯示)', b.speaker);
        if (spk != null) b.speaker = spk;
      }
      redrawBubbles(wrap, st);
    };
    el.onclick = ev => ev.stopPropagation();
    el.onpointerdown = ev => {
      if (ev.target.closest('.del, .btype')) return;
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

// 從分鏡對白帶入氣泡(只補沒有氣泡的格)
$('#ly-fill').onclick = async () => {
  if (!dir) return;
  const sb = await data.loadStoryboard(dir);
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
    // 先落檔再重繪——render() 會從磁碟重讀 panel.json,不先存會被蓋掉
    await data.savePanelState(dir, p.id, st);
    filled += 1;
  }
  await render();
  toast(`已帶入 ${filled} 格的對白(已存檔)`);
};

$('#ly-save').onclick = async () => {
  for (const [pid, st] of panelStates) await data.savePanelState(dir, pid, st);
  setStatus('#ly-status', '氣泡已儲存');
};

// ── 匯出 ──
$('#do-export').onclick = async () => {
  if (!app.meta) { toast('請先開啟專案'); return; }
  try {
    setStatus('#export-status', '收集章節資料…');
    const chapters = [];
    const imageBlobs = []; // {path, blob}
    for (const ch of await data.listChapters()) {
      const sb = await data.loadStoryboard(ch.dir);
      const panels = [];
      for (const p of sb.panels) {
        const st = await data.loadPanelState(ch.dir, p.id);
        if (!st.chosen) continue;
        const url = await data.panelImageURL(ch.dir, p.id, st.chosen);
        if (!url) continue;
        const blob = await (await fetch(url)).blob();
        const path = `imgs/ch${ch.dir}-${p.id}.png`;
        imageBlobs.push({ path, blob });
        panels.push({ image: path, bubbles: st.bubbles });
      }
      if (panels.length) chapters.push({ title: ch.title, panels });
    }
    if (!chapters.length) { setStatus('#export-status', '沒有任何已選定格圖,無可匯出', true); return; }

    setStatus('#export-status', '寫入 dist/ …');
    const files = buildReaderFiles({ title: app.meta.title, chapters });
    for (const f of files) await store.writeText('dist/' + f.path, f.content);
    for (const im of imageBlobs) await store.writeBlob('dist/' + im.path, im.blob);
    for (const size of [192, 512]) await store.writeBlob(`dist/icon-${size}.png`, await makeIcon(app.meta.title, size));

    const total = files.length + imageBlobs.length + 2;
    setStatus('#export-status', `完成:dist/ 共 ${total} 個檔,${chapters.length} 章。丟到任何靜態空間即可離線閱讀。`);
  } catch (e) {
    setStatus('#export-status', '匯出失敗:' + e.message, true);
  }
};

function makeIcon(title, size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#111114';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#e8e8ea';
  ctx.font = `700 ${size * 0.55}px "Noto Sans TC", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText((title || '漫').slice(0, 1), size / 2, size / 2 + size * 0.03);
  return new Promise(ok => c.toBlob(ok, 'image/png'));
}
