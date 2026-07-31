// 排版站:氣泡編輯(拖曳/雙擊 modal)+效果圖層(透明疊層,拖曳縮放)。
// 三層合成:底圖(不動)→ 效果層(fx,生成或上傳,CSS 混合免摳圖)→ 字層(氣泡)。
// 只管字的內容+大概位置與效果層的擺位;匯出在 bake.js。
import { $, h, toast, setStatus, modal, emptyState } from './ui.js';
import * as store from './store.js';
import * as data from './data.js';
import { getProvider, generateImages } from './providers.js';
import { buildEffectPrompt } from './prompt.js';
import { app, requireProject } from './app.js';
import { resolveTail } from './export.js';
import { lintLayout, summarize } from './lint-layout.js';

let panelStates = new Map(); // panelId -> {chosen, bubbles, effects}

// ── 復原 ──
// 刪氣泡是直接改陣列再存檔,誤刪就回不來。動手前先拍一張快照,Ctrl+Z 倒回去。
// 只記字層與效果層的擺位(圖檔本身不動),所以一筆很小,存 30 步綽綽有餘。
const undoStack = [];
const UNDO_MAX = 30;

function snap(label, pids) {
  const items = [];
  for (const pid of pids) {
    const st = panelStates.get(pid);
    if (st) items.push({ pid, bubbles: structuredClone(st.bubbles || []), effects: structuredClone(st.effects || []) });
  }
  if (!items.length) return;
  undoStack.push({ label, items });
  if (undoStack.length > UNDO_MAX) undoStack.shift();
}

async function undo() {
  const entry = undoStack.pop();
  if (!entry) { toast('沒有可以復原的動作'); return; }
  for (const it of entry.items) {
    const st = panelStates.get(it.pid);
    if (!st) continue;
    st.bubbles = it.bubbles;
    st.effects = it.effects;
    await data.savePanelState(app.chapter, it.pid, st);   // 復原也要落檔,否則重整又回到壞掉的版本
    const wrap = document.querySelector(`.ly-panel[data-pid="${it.pid}"]`);
    if (wrap) await redrawOverlays(wrap, st);
  }
  toast(`已復原:${entry.label}`);
}

// Ctrl/Cmd+Z——只在排版分頁生效,免得在別的分頁打字時被攔截
window.addEventListener('keydown', ev => {
  if (!(ev.ctrlKey || ev.metaKey) || ev.key.toLowerCase() !== 'z') return;
  if (!document.getElementById('tab-layout')?.classList.contains('active')) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) return;
  ev.preventDefault();
  undo();
});

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
    st.effects = st.effects || [];
    panelStates.set(p.id, st);
    const url = await data.panelImageURL(app.chapter, p.id, st.chosen);
    if (!url) continue;
    nodes.push(await renderPanel(p, st, url));
  }
  box.replaceChildren(...(nodes.length ? nodes : [emptyState('此章還沒有「已選定」的格圖,先到「生圖」。')]));
}

async function renderPanel(p, st, url) {
  const wrap = h('div', { class: 'ly-panel', dataset: { pid: p.id } });
  wrap.append(h('span', { class: 'pnum' }, String(p.order)));
  const img = h('img', { src: url, draggable: false });
  wrap.append(img);
  img.onclick = e => {
    const r = wrap.getBoundingClientRect();
    snap('新增氣泡', [p.id]);
    st.bubbles.push({
      x: Math.round((e.clientX - r.left) / r.width * 100),
      y: Math.round((e.clientY - r.top) / r.height * 100),
      w: 40, type: 'speech', speaker: '', text: '雙擊編輯文字',
    });
    redrawOverlays(wrap, st);
  };
  wrap.append(h('div', { class: 'ly-tools' },
    h('button', { class: 'icon-btn', onclick: () => addFxGenerate(p, st, wrap) }, '＋效果層(生成)'),
    h('button', { class: 'icon-btn', onclick: () => addFxUpload(p, st, wrap) }, '＋上傳'),
  ));
  await redrawOverlays(wrap, st);
  return wrap;
}

// ── 效果圖層 ──

async function nextFxName(pid) {
  const entries = await store.listDir(data.chapterPath(app.chapter, `panels/${pid}`));
  const n = entries.filter(e => e.kind === 'file' && /^fx-\d+\.png$/.test(e.name)).length;
  return `fx-${n + 1}.png`;
}

async function addFxGenerate(p, st, wrap) {
  const r = await modal({
    title: '生成效果層',
    fields: [
      { key: 'desc', label: '效果描述(例:巨大的手繪擬聲字「轟」,碎裂筆勢/一團金色光暈)', type: 'textarea', value: '' },
      { key: 'mode', label: '模式', type: 'select', value: 'ink', options: [
        { value: 'ink', label: '墨(白底黑墨——效果字/線條,疊上去白色消失)' },
        { value: 'light', label: '光(黑底發光——光暈/火光,疊上去黑色消失)' },
      ] },
    ],
    confirmText: '生成',
  });
  if (!r || !r.desc.trim()) return;
  const provider = getProvider(app.meta?.providers.image);
  if (!provider) { toast('未設定生圖模型(到「專案」選擇)'); return; }
  try {
    setStatus('#ly-status', '生成效果層…');
    const imgs = await generateImages({
      provider,
      prompt: buildEffectPrompt({ desc: r.desc.trim(), mode: r.mode, style: app.meta.style }),
      count: 1, size: '1024x1024',
      onStatus: m => setStatus('#ly-status', m),
    });
    if (!imgs.length) throw new Error('沒有回傳圖片');
    const name = await nextFxName(p.id);
    await store.writeBlob(data.chapterPath(app.chapter, `panels/${p.id}/${name}`), store.dataURLtoBlob(imgs[0]));
    st.effects.push({ image: name, x: 50, y: 50, w: 60, rot: 0, op: 100, blend: r.mode === 'light' ? 'screen' : 'multiply' });
    await data.savePanelState(app.chapter, p.id, st);
    await redrawOverlays(wrap, st);
    setStatus('#ly-status', '效果層已加入(已存檔);拖曳移動、雙擊調整、右鍵刪除');
  } catch (e) {
    setStatus('#ly-status', '效果層失敗:' + e.message, true);
  }
}

function addFxUpload(p, st, wrap) {
  const input = h('input', { type: 'file', accept: 'image/png' });
  input.onchange = async () => {
    const f = input.files[0];
    if (!f) return;
    const name = await nextFxName(p.id);
    await store.writeBlob(data.chapterPath(app.chapter, `panels/${p.id}/${name}`), f);
    // 自備透明 PNG 預設 normal;要當墨/光用雙擊改 blend
    st.effects.push({ image: name, x: 50, y: 50, w: 60, rot: 0, op: 100, blend: 'normal' });
    await data.savePanelState(app.chapter, p.id, st);
    await redrawOverlays(wrap, st);
  };
  input.click();
}

async function editFx(fx) {
  const r = await modal({
    title: '效果層設定',
    fields: [
      { key: 'w', label: '寬度(%)', value: String(fx.w) },
      { key: 'rot', label: '旋轉(度)', value: String(fx.rot || 0) },
      { key: 'op', label: '不透明度(%)', value: String(fx.op ?? 100) },
      { key: 'blend', label: '混合', type: 'select', value: fx.blend, options: [
        { value: 'multiply', label: '墨(multiply,白=透明)' },
        { value: 'screen', label: '光(screen,黑=透明)' },
        { value: 'normal', label: '一般(自備透明圖)' },
      ] },
    ],
    confirmText: '套用',
  });
  if (!r) return false;
  fx.w = Math.min(200, Math.max(5, Number(r.w) || 60));
  fx.rot = Number(r.rot) || 0;
  fx.op = Math.min(100, Math.max(0, Number(r.op) || 100));
  fx.blend = r.blend;
  return true;
}

// ── 疊層重繪(效果層在下、氣泡在上) ──

async function redrawOverlays(wrap, st) {
  wrap.querySelectorAll('.fx, .bubble').forEach(el => el.remove());
  for (const [i, fx] of st.effects.entries()) {
    const url = await data.panelImageURL(app.chapter, wrap.dataset.pid, fx.image);
    if (!url) continue;
    const el = h('img', { class: 'fx', src: url, draggable: false, title: '拖曳移動、雙擊調整、右鍵刪除' });
    applyFxStyle(el, fx);
    el.ondblclick = async ev => {
      ev.stopPropagation();
      if (await editFx(fx)) { applyFxStyle(el, fx); autosaveWrap(wrap, st); }
    };
    el.oncontextmenu = ev => {
      ev.preventDefault();
      st.effects.splice(i, 1);
      redrawOverlays(wrap, st);
      autosaveWrap(wrap, st);
    };
    dragXY(el, wrap, fx, () => applyFxStyle(el, fx));
    wrap.append(el);
  }
  st.bubbles.forEach((b, i) => {
    const el = h('div', { class: 'bubble ' + b.type + ' t-' + resolveTail(b) },
      b.speaker && b.type !== 'narration' ? h('span', { class: 'spk' }, b.speaker) : null,
      b.text,
      h('button', { class: 'del', onclick: ev => {
        ev.stopPropagation();
        snap('刪除氣泡', [wrap.dataset.pid]);
        st.bubbles.splice(i, 1);
        redrawOverlays(wrap, st);
        autosaveWrap(wrap, st);
      } }, '×'),
    );
    el.style.left = b.x + '%';
    el.style.top = b.y + '%';
    el.style.maxWidth = (b.w || 40) + '%';
    if (b.fs) el.style.fontSize = b.fs + 'cqw';
    el.ondblclick = async ev => {
      ev.stopPropagation();
      const before = structuredClone(b);
      if (await editBubble(b)) {
        undoStack.push({ label: '編輯氣泡', items: [{ pid: wrap.dataset.pid,
          bubbles: st.bubbles.map(x => x === b ? before : structuredClone(x)),
          effects: structuredClone(st.effects || []) }] });
        redrawOverlays(wrap, st);
        autosaveWrap(wrap, st);
      }
    };
    el.onclick = ev => ev.stopPropagation();
    dragXY(el, wrap, b, () => { el.style.left = b.x + '%'; el.style.top = b.y + '%'; });
    wrap.append(el);
  });
}

function applyFxStyle(el, fx) {
  el.style.left = fx.x + '%';
  el.style.top = fx.y + '%';
  el.style.width = fx.w + '%';
  el.style.transform = `translate(-50%,-50%) rotate(${fx.rot || 0}deg)`;
  el.style.opacity = String((fx.op ?? 100) / 100);
  el.style.mixBlendMode = fx.blend === 'normal' ? 'normal' : fx.blend;
}

function dragXY(el, wrap, obj, onMove) {
  el.onpointerdown = ev => {
    if (ev.target.closest('.del')) return;
    ev.preventDefault();
    const r = wrap.getBoundingClientRect();
    let moved = false;
    const move = mv => {
      if (!moved) { snap('移動', [wrap.dataset.pid]); moved = true; }   // 第一次真的動了才記,免得點一下就塞一筆
      obj.x = Math.min(100, Math.max(0, Math.round((mv.clientX - r.left) / r.width * 100)));
      obj.y = Math.min(100, Math.max(0, Math.round((mv.clientY - r.top) / r.height * 100)));
      onMove();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (moved) { onMove(); autosaveWrap(wrap, panelStates.get(wrap.dataset.pid)); }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
}

function autosaveWrap(wrap, st) {
  data.savePanelState(app.chapter, wrap.dataset.pid, st);
}

async function editBubble(b) {
  const r = await modal({
    title: '編輯氣泡',
    fields: [
      { key: 'text', label: '文字', type: 'textarea', value: b.text },
      { key: 'speaker', label: '說話者(留空=不顯示)', value: b.speaker },
      { key: 'type', label: '類型', type: 'select', value: b.type, options: [
        { value: 'speech', label: '對白(白泡)' },
        { value: 'thought', label: '內心(無框浮字+白光暈)' },
        { value: 'narration', label: '旁白(淡黑底正黑體)' },
        { value: 'sfx', label: '效果字(CSS 版;要畫進圖用效果層)' },
      ] },
      // 每顆泡各自設定:同一格裡三顆泡的說話者位置不同,方向本來就該各選各的
      { key: 'tail', label: '尾巴指向(這顆泡專屬;只對白泡有效)', type: 'select', value: b.tail || 'auto', options: [
        { value: 'auto', label: '自動(指向格中心;預設)' },
        { value: 'bottom', label: '下' },
        { value: 'bottom-left', label: '左下' },
        { value: 'bottom-right', label: '右下' },
        { value: 'top', label: '上' },
        { value: 'top-left', label: '左上' },
        { value: 'top-right', label: '右上' },
        { value: 'left', label: '左' },
        { value: 'right', label: '右' },
        { value: 'none', label: '不要尾巴' },
      ] },
      { key: 'w', label: '最大寬度(%)', value: String(b.w || 40) },
      { key: 'fs', label: '字級(留空=自動;數字=格寬%,自動約3.4)', value: b.fs ? String(b.fs) : '' },
    ],
    confirmText: '套用',
  });
  if (!r) return false;
  b.text = r.text;
  b.speaker = r.speaker;
  b.type = r.type;
  b.tail = r.tail;
  b.w = Math.min(90, Math.max(10, Number(r.w) || 40));
  const fs = parseFloat(r.fs);
  if (Number.isFinite(fs) && fs > 0) b.fs = Math.min(15, Math.max(1, fs)); else delete b.fs;
  return true;
}

// 從分鏡對白帶入(只補沒有氣泡的格;帶入即落檔)
$('#ly-fill').onclick = async () => {
  if (!app.chapter) return;
  const sb = await data.loadStoryboard(app.chapter);
  let filled = 0;
  for (const p of sb.panels) {
    const st = panelStates.get(p.id);
    if (!st || st.bubbles.length || !p.dialogue.length) continue;
    snap('從分鏡帶入對白', [p.id]);
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

// ── 全章文字取代 ──
// 改一個角色名或口頭禪,本來要一格一格開氣泡編輯視窗。整章一次換完,而且可以 Ctrl+Z 倒回去。
$('#ly-replace').onclick = async () => {
  if (!app.chapter) return;
  const r = await modal({
    title: '全章取代文字',
    fields: [
      { key: 'from', label: '找什麼', placeholder: '例:陸脩' },
      { key: 'to', label: '換成什麼(留空=刪掉這段字)' },
      { key: 'where', label: '換哪裡', type: 'select', value: 'text', options: [
        { value: 'text', label: '只換氣泡文字' },
        { value: 'both', label: '氣泡文字＋說話者' },
        { value: 'speaker', label: '只換說話者' },
      ] },
    ],
    confirmText: '取代',
  });
  if (!r || !r.from) return;

  const hitPids = [];
  for (const [pid, st] of panelStates) {
    const hit = (st.bubbles || []).some(b =>
      (r.where !== 'speaker' && String(b.text || '').includes(r.from)) ||
      (r.where !== 'text' && String(b.speaker || '').includes(r.from)));
    if (hit) hitPids.push(pid);
  }
  if (!hitPids.length) { toast(`整章找不到「${r.from}」`); return; }

  snap(`全章取代「${r.from}」`, hitPids);   // 一次動作一筆,Ctrl+Z 全部一起倒回
  let n = 0;
  for (const pid of hitPids) {
    const st = panelStates.get(pid);
    for (const b of st.bubbles) {
      if (r.where !== 'speaker' && String(b.text || '').includes(r.from)) {
        b.text = b.text.split(r.from).join(r.to || ''); n += 1;
      }
      if (r.where !== 'text' && String(b.speaker || '').includes(r.from)) {
        b.speaker = b.speaker.split(r.from).join(r.to || ''); n += 1;
      }
    }
    await data.savePanelState(app.chapter, pid, st);
  }
  await render();
  toast(`${hitPids.length} 格、共 ${n} 處已取代(Ctrl+Z 可復原)`);
};

// ── 完稿檢查 ──
$('#ly-lint').onclick = async () => {
  if (!app.chapter) return;
  const sb = await data.loadStoryboard(app.chapter);
  const panels = sb.panels.map(p => ({
    id: p.id, order: p.order, dialogue: p.dialogue || [],
    state: panelStates.get(p.id) || {},
  }));
  const issues = lintLayout(panels);
  if (!issues.length) { setStatus('#ly-status', `完稿檢查:${summarize(issues)}(${panels.length} 格)`); return; }
  await modal({
    title: `完稿檢查——${summarize(issues)}`,
    body: h('div', { class: 'lint-list' }, ...issues.map(i =>
      h('p', { class: i.level === 'error' ? 'lint-err' : 'lint-warn' },
        h('b', {}, `第 ${i.order} 格`), ' ' + i.msg))),
    confirmText: '知道了',
  });
  setStatus('#ly-status', `完稿檢查:${summarize(issues)}`, issues.some(i => i.level === 'error'));
};

$('#ly-save').onclick = async () => {
  for (const [pid, st] of panelStates) await data.savePanelState(app.chapter, pid, st);
  setStatus('#ly-status', '氣泡與效果層已儲存');
};
