// 分鏡站(章節由全域選擇)
import { $, h, toast, setStatus, confirmDialog } from './ui.js';
import * as store from './store.js';
import * as data from './data.js';
import { getProvider, chatText } from './providers.js';
import { buildStoryboardPrompt, parseStoryboard } from './prompt.js';
import { app, requireProject, refreshChapters } from './app.js';

let sb = { panels: [] };

// 自動暫存:任何編輯 1.2 秒後落檔,不再依賴手按「儲存分鏡」
let autosaveTimer;
function autosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(async () => {
    if (!app.chapter) return;
    sb.panels.forEach((p, i) => { p.order = i + 1; });
    await data.saveStoryboard(app.chapter, sb);
    await store.writeText(data.chapterPath(app.chapter, 'source.md'), $('#sb-source')?.value ?? '');
    setStatus('#sb-status', '已自動儲存');
  }, 1200);
}

export async function refreshStoryboard() {
  const body = $('#sb-body');
  if (!requireProject(body)) return;

  body.replaceChildren(
    h('div', { class: 'card' },
      h('div', { class: 'actions', style: { marginTop: '0' } },
        h('input', { id: 'sb-url', placeholder: '從網址匯入:貼章節閱讀頁網址,自動建章節+抓標題+抽正文', style: { flex: '1', minWidth: '240px', marginTop: '0' } }),
        h('button', { id: 'sb-import', onclick: importFromURL }, '匯入'),
      ),
      h('label', {}, '章節原文', h('textarea', { id: 'sb-source', rows: 8, oninput: autosave, placeholder: '把整章小說文字貼進來,或用上面的網址匯入…' })),
      h('div', { class: 'actions' },
        h('button', { onclick: saveSource }, '儲存原文'),
        h('button', { class: 'primary', onclick: aiStoryboard }, 'AI 產生分鏡'),
        h('span', { id: 'sb-status', class: 'status' }),
      ),
    ),
    h('div', { id: 'sb-panels' }),
    h('div', { class: 'actions' },
      h('button', { onclick: addPanel }, '新增一格'),
      h('button', { class: 'primary', onclick: saveStoryboard }, '儲存分鏡'),
    ),
  );

  if (app.chapter) {
    $('#sb-source').value = await store.readText(data.chapterPath(app.chapter, 'source.md'), '');
    sb = await data.loadStoryboard(app.chapter);
  } else {
    sb = { panels: [] };
  }
  renderPanels();
}

async function importFromURL() {
  const url = $('#sb-url').value.trim();
  if (!url) { toast('先貼章節頁網址'); return; }
  try {
    setStatus('#sb-status', '抓取網頁…');
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const { extractChapterFromHTML } = await import('./import.js');
    const { title, text } = extractChapterFromHTML(await res.text());
    const dir = await data.newChapter(title || url.split('/').pop());
    await store.writeText(data.chapterPath(dir, 'source.md'), text);
    await refreshChapters(dir);
    await refreshStoryboard();
    setStatus('#sb-status', `已匯入「${title}」:${text.length} 字(原文已存檔)`);
  } catch (e) {
    setStatus('#sb-status', '匯入失敗:' + e.message + '(跨站網址需對方允許 CORS)', true);
  }
}

async function saveSource() {
  if (!app.chapter) { toast('先在右上角新增章節'); return; }
  await store.writeText(data.chapterPath(app.chapter, 'source.md'), $('#sb-source').value);
  toast('原文已儲存');
}

async function aiStoryboard() {
  if (!app.chapter) { toast('先在右上角新增章節'); return; }
  const text = $('#sb-source').value.trim();
  if (!text) { toast('請先貼上章節原文'); return; }
  const provider = getProvider(app.meta?.providers.text);
  if (!provider) { setStatus('#sb-status', '未設定文字模型(到「專案」選擇)', true); return; }
  if (sb.panels.length && !await confirmDialog(`已有 ${sb.panels.length} 格分鏡,AI 產生會整份覆蓋,確定?`, '覆蓋')) return;
  try {
    setStatus('#sb-status', '呼叫文字模型產生分鏡…(約半分鐘)');
    const chars = await data.listCharacters();
    const reply = await chatText({ provider, prompt: buildStoryboardPrompt(text, chars), onStatus: m => setStatus('#sb-status', m) });
    sb = parseStoryboard(reply);
    await data.saveStoryboard(app.chapter, sb);
    renderPanels();
    setStatus('#sb-status', `完成:${sb.panels.length} 格(已儲存)`);
  } catch (e) {
    setStatus('#sb-status', '失敗:' + e.message, true);
  }
}

function addPanel() {
  if (!app.chapter) { toast('先在右上角新增章節'); return; }
  sb.panels.push({ id: 'p' + Date.now().toString(36), order: sb.panels.length + 1, scene: '', characters: [], world: [], continues: '', camera: '', shot: '中景', dialogue: [], notes: '' });
  renderPanels();
  autosave();
}

async function saveStoryboard() {
  if (!app.chapter) return;
  sb.panels.forEach((p, i) => { p.order = i + 1; });
  await data.saveStoryboard(app.chapter, sb);
  toast('分鏡已儲存');
}

function move(i, delta) {
  const j = i + delta;
  if (j < 0 || j >= sb.panels.length) return;
  [sb.panels[i], sb.panels[j]] = [sb.panels[j], sb.panels[i]];
  renderPanels();
  autosave();
}

function renderPanels() {
  const box = $('#sb-panels');
  if (!box) return;
  box.replaceChildren(...sb.panels.map((p, i) => h('div', { class: 'sb-panel' },
    h('div', { class: 'head' },
      h('span', { class: 'num' }, String(i + 1)),
      h('span', { class: 'spacer' }),
      h('button', { class: 'icon-btn', onclick: () => move(i, -1), title: '上移' }, '↑'),
      h('button', { class: 'icon-btn', onclick: () => move(i, 1), title: '下移' }, '↓'),
      h('button', { class: 'danger icon-btn', onclick: () => { sb.panels.splice(i, 1); renderPanels(); autosave(); } }, '刪'),
    ),
    h('label', {}, '畫面描述', h('textarea', { rows: 2, oninput: e => { p.scene = e.target.value; autosave(); } }, p.scene)),
    h('div', { class: 'sb-grid' },
      h('label', {}, '出場角色(id,逗號分隔)', h('input', { value: p.characters.join(','), oninput: e => { p.characters = e.target.value.split(/[,、\s]+/).filter(Boolean); autosave(); } })),
      h('label', {}, '場景/道具(world id,逗號分隔)', h('input', { value: (p.world || []).join(','), oninput: e => { p.world = e.target.value.split(/[,、\s]+/).filter(Boolean); autosave(); } })),
      h('label', {}, '機位(平面圖上的代號,例 A)', h('input', { value: p.camera || '', oninput: e => { p.camera = e.target.value.trim(); autosave(); } })),
      h('label', {}, '承接姿勢(前一格 id,連戲用)', h('input', { value: p.continues || '', oninput: e => { p.continues = e.target.value.trim(); autosave(); } })),
      h('label', {}, '鏡頭', h('input', { value: p.shot, oninput: e => { p.shot = e.target.value; autosave(); } })),
      h('label', {}, '備註', h('input', { value: p.notes, oninput: e => { p.notes = e.target.value; autosave(); } })),
    ),
    h('div', {},
      ...p.dialogue.map((d, di) => h('div', { class: 'dlg-row' },
        h('input', { value: d.speaker, placeholder: '說話者', oninput: e => { d.speaker = e.target.value; autosave(); } }),
        h('input', { value: d.text, placeholder: '台詞', oninput: e => { d.text = e.target.value; autosave(); } }),
        h('select', { onchange: e => { d.type = e.target.value; autosave(); } },
          h('option', { value: 'speech', selected: d.type === 'speech' }, '對白'),
          h('option', { value: 'thought', selected: d.type === 'thought' }, '內心'),
          h('option', { value: 'narration', selected: d.type === 'narration' }, '旁白'),
        ),
        h('button', { class: 'danger icon-btn', onclick: () => { p.dialogue.splice(di, 1); renderPanels(); autosave(); } }, '刪'),
      )),
      h('button', { class: 'icon-btn', onclick: () => { p.dialogue.push({ speaker: '', text: '', type: 'speech' }); renderPanels(); autosave(); } }, '＋台詞'),
    ),
  )));
}
