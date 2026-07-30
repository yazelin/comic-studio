// 章節分鏡站
import { $, h, toast, setStatus } from './ui.js';
import * as store from './store.js';
import * as data from './data.js';
import { getProvider, chatText } from './providers.js';
import { buildStoryboardPrompt, parseStoryboard } from './prompt.js';
import { app } from './app.js';

let dir = null;      // 目前章節資料夾
let sb = { panels: [] };

export async function refreshStoryboard() {
  const chapters = await data.listChapters();
  const sel = $('#sb-chapter');
  sel.replaceChildren(...chapters.map(c => h('option', { value: c.dir, selected: c.dir === dir }, `${c.dir} ${c.title}`)));
  sel.onchange = loadChapter;
  if (!dir && chapters.length) dir = chapters[0].dir;
  if (dir) { sel.value = dir; await loadChapter(); }
}

async function loadChapter() {
  dir = $('#sb-chapter').value;
  if (!dir) return;
  $('#sb-source').value = await store.readText(data.chapterPath(dir, 'source.md'), '');
  sb = await data.loadStoryboard(dir);
  renderPanels();
}

$('#sb-import').onclick = async () => {
  const url = $('#sb-url').value.trim();
  if (!url) { toast('先貼章節頁網址'); return; }
  if (!store.hasProject()) { toast('請先在「專案」開啟資料夾'); return; }
  try {
    setStatus('#sb-status', '抓取網頁…');
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const { extractChapterFromHTML } = await import('./import.js');
    const { title, text } = extractChapterFromHTML(await res.text());
    dir = await data.newChapter(title || url.split('/').pop());
    await store.writeText(data.chapterPath(dir, 'source.md'), text);
    await refreshStoryboard();
    setStatus('#sb-status', `已匯入「${title}」:${text.length} 字(原文已存檔)`);
  } catch (e) {
    setStatus('#sb-status', '匯入失敗:' + e.message + '(跨站網址需對方允許 CORS;同在 yazelin.github.io 的頁一定可以)', true);
  }
};

$('#sb-new-chapter').onclick = async () => {
  const title = prompt('章節標題?');
  if (!title) return;
  dir = await data.newChapter(title);
  await refreshStoryboard();
  toast('已建立章節 ' + dir);
};

$('#sb-save-source').onclick = async () => {
  if (!dir) { toast('請先新增章節'); return; }
  await store.writeText(data.chapterPath(dir, 'source.md'), $('#sb-source').value);
  toast('原文已儲存');
};

$('#sb-ai').onclick = async () => {
  if (!dir) { toast('請先新增章節'); return; }
  const text = $('#sb-source').value.trim();
  if (!text) { toast('請先貼上章節原文'); return; }
  const provider = getProvider(app.meta?.providers.text);
  if (!provider) { setStatus('#sb-status', '未設定文字模型(專案頁選擇)', true); return; }
  try {
    setStatus('#sb-status', '呼叫文字模型產生分鏡…');
    const chars = await data.listCharacters();
    const reply = await chatText({ provider, prompt: buildStoryboardPrompt(text, chars), onStatus: m => setStatus('#sb-status', m) });
    const parsed = parseStoryboard(reply);
    if (sb.panels.length && !confirm(`已有 ${sb.panels.length} 格分鏡,要整份覆蓋嗎?`)) { setStatus('#sb-status', '已取消'); return; }
    sb = parsed;
    await data.saveStoryboard(dir, sb);
    renderPanels();
    setStatus('#sb-status', `完成:${sb.panels.length} 格(已儲存)`);
  } catch (e) {
    setStatus('#sb-status', '失敗:' + e.message, true);
  }
};

$('#sb-add-panel').onclick = () => {
  if (!dir) { toast('請先新增章節'); return; }
  sb.panels.push({ id: 'p' + Date.now().toString(36), order: sb.panels.length + 1, scene: '', characters: [], shot: '中景', dialogue: [], notes: '' });
  renderPanels();
};

$('#sb-save').onclick = async () => {
  if (!dir) return;
  sb.panels.forEach((p, i) => { p.order = i + 1; });
  await data.saveStoryboard(dir, sb);
  toast('分鏡已儲存');
};

function move(i, delta) {
  const j = i + delta;
  if (j < 0 || j >= sb.panels.length) return;
  [sb.panels[i], sb.panels[j]] = [sb.panels[j], sb.panels[i]];
  renderPanels();
}

function renderPanels() {
  const box = $('#sb-panels');
  box.replaceChildren(...sb.panels.map((p, i) => h('div', { class: 'sb-panel' },
    h('div', { class: 'head' },
      h('span', { class: 'num' }, '#' + (i + 1)),
      h('button', { onclick: () => move(i, -1) }, '上移'),
      h('button', { onclick: () => move(i, 1) }, '下移'),
      h('button', { class: 'danger', onclick: () => { sb.panels.splice(i, 1); renderPanels(); } }, '刪除'),
    ),
    h('label', {}, '畫面描述', h('textarea', { rows: 2, oninput: e => { p.scene = e.target.value; }, onchange: e => { p.scene = e.target.value; } }, p.scene)),
    h('div', { class: 'sb-grid' },
      h('label', {}, '出場角色(id,逗號分隔)', h('input', { value: p.characters.join(','), oninput: e => { p.characters = e.target.value.split(/[,、\s]+/).filter(Boolean); } })),
      h('label', {}, '鏡頭', h('input', { value: p.shot, oninput: e => { p.shot = e.target.value; } })),
      h('label', {}, '備註', h('input', { value: p.notes, oninput: e => { p.notes = e.target.value; } })),
    ),
    h('div', {},
      ...p.dialogue.map((d, di) => h('div', { class: 'dlg-row' },
        h('input', { value: d.speaker, placeholder: '說話者', oninput: e => { d.speaker = e.target.value; } }),
        h('input', { value: d.text, placeholder: '台詞', oninput: e => { d.text = e.target.value; } }),
        h('select', { onchange: e => { d.type = e.target.value; } },
          h('option', { value: 'speech', selected: d.type === 'speech' }, '對白'),
          h('option', { value: 'thought', selected: d.type === 'thought' }, '內心'),
          h('option', { value: 'narration', selected: d.type === 'narration' }, '旁白'),
        ),
        h('button', { class: 'danger', onclick: () => { p.dialogue.splice(di, 1); renderPanels(); } }, '刪'),
      )),
      h('button', { onclick: () => { p.dialogue.push({ speaker: '', text: '', type: 'speech' }); renderPanels(); } }, '加台詞'),
    ),
  )));
}
