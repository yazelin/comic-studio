// 工作台入口:步驟導航、全域章節、專案站、模型站;其餘站各自模組。
import { $, h, toast, modal, emptyState } from './ui.js';
import * as store from './store.js';
import * as data from './data.js';
import { loadProviders, saveProviders, isPersisted, applyProjectKeys } from './providers.js';
import { refreshStoryboard } from './storyboard.js';
import { refreshCharacters } from './characters.js';
import { refreshGenerate } from './generate.js';
import { refreshLayout } from './layout.js';

export const app = { meta: null, chapter: '' }; // 全站共享:專案 meta+目前章節

const refreshers = {
  storyboard: refreshStoryboard,
  characters: refreshCharacters,
  generate: refreshGenerate,
  layout: refreshLayout,
  settings: renderSettings,
  project: renderProject,
};
let activeTab = 'project';

async function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('#steps .step').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab').forEach(s => s.classList.toggle('active', s.id === 'tab-' + tab));
  const fn = refreshers[tab];
  if (fn) await fn();
}
document.querySelectorAll('#steps .step').forEach(btn => { btn.onclick = () => switchTab(btn.dataset.tab); });

export function requireProject(container) {
  if (store.hasProject()) return true;
  container.replaceChildren(emptyState('還沒開啟專案資料夾。', '前往「專案」', () => switchTab('project')));
  return false;
}

// ── 全域章節 ──
export async function refreshChapters(selectDir = null) {
  const chapters = await data.listChapters();
  const sel = $('#global-chapter');
  if (selectDir) app.chapter = selectDir;
  if (!app.chapter && chapters.length) app.chapter = chapters[0].dir;
  if (app.chapter && !chapters.some(c => c.dir === app.chapter)) app.chapter = chapters[0]?.dir || '';
  sel.replaceChildren(
    chapters.length ? null : h('option', { value: '' }, '尚無章節'),
    ...chapters.map(c => h('option', { value: c.dir, selected: c.dir === app.chapter }, `${c.dir} ${c.title}`)),
  );
  return chapters;
}

$('#global-chapter').onchange = async () => {
  app.chapter = $('#global-chapter').value;
  if (refreshers[activeTab] && ['storyboard', 'generate', 'layout'].includes(activeTab)) await refreshers[activeTab]();
};

$('#new-chapter').onclick = async () => {
  if (!store.hasProject()) { toast('請先開啟專案資料夾'); return; }
  const r = await modal({ title: '新增章節', fields: [{ key: 'title', label: '章節標題', placeholder: '第一章:一萬字的火球' }], confirmText: '建立' });
  if (!r || !r.title) return;
  const dir = await data.newChapter(r.title);
  await refreshChapters(dir);
  toast(`已建立章節 ${dir}`);
  if (['storyboard', 'generate', 'layout'].includes(activeTab)) await refreshers[activeTab]();
};

// ── 專案站 ──
async function renderProject() {
  const empty = $('#project-empty');
  if (store.hasProject()) { empty.replaceChildren(); return; }
  const saved = await store.savedProjectName().catch(() => null);
  if (saved) {
    const box = emptyState(`上次開的專案:${saved}。重新整理後瀏覽器需要你再點一次授權。`, `重新開啟「${saved}」`, async () => {
      try { await afterOpen(await store.restoreProject()); } catch (e) { toast(e.message); }
    });
    box.append(h('button', { style: { marginTop: '.6rem' }, onclick: openProject }, '開啟其他資料夾'));
    empty.replaceChildren(box);
  } else {
    empty.replaceChildren(emptyState('選一個資料夾當專案——新資料夾或既有專案都可以。', '開啟 / 建立專案資料夾', openProject));
  }
}

async function openProject() {
  if (!window.showDirectoryPicker) { toast('此瀏覽器不支援 File System Access,請用 Chrome / Edge'); return; }
  try {
    await afterOpen(await store.openProject());
  } catch (e) {
    if (e.name !== 'AbortError') toast('開啟失敗:' + e.message);
  }
}

async function afterOpen(name) {
  $('#project-badge').textContent = name;
  app.meta = await data.loadMeta();
  if (!app.meta.title) app.meta.title = name;
  const nKeys = applyProjectKeys(await store.readJSON('keys.json', null));
  fillProjectForm();
  $('#project-form').hidden = false;
  renderProject();
  await refreshChapters();
  toast(nKeys ? `專案已開啟(keys.json 帶入 ${nKeys} 把 key)` : '專案已開啟');
}

function providerOptions(sel, chosen) {
  sel.replaceChildren(...loadProviders().map(p => h('option', { selected: p.name === chosen }, p.name)));
}

function fillProjectForm() {
  $('#p-title').value = app.meta.title;
  $('#p-style').value = app.meta.style;
  providerOptions($('#p-image-provider'), app.meta.providers.image);
  providerOptions($('#p-text-provider'), app.meta.providers.text);
}

$('#save-project').onclick = async () => {
  app.meta.title = $('#p-title').value.trim();
  app.meta.style = $('#p-style').value.trim();
  app.meta.providers.image = $('#p-image-provider').value;
  app.meta.providers.text = $('#p-text-provider').value;
  await data.saveMeta(app.meta);
  toast('已儲存 project.json');
};

// ── 模型站 ──
const TYPES = ['codex-image-service', 'gemini-web', 'openai-compatible'];

function renderSettings() {
  const list = loadProviders();
  $('#remember-keys').checked = isPersisted();
  const box = $('#provider-list');
  box.replaceChildren(
    h('div', { class: 'provider-row provider-head' }, h('span', {}, '名稱'), h('span', {}, '類型'), h('span', {}, 'baseurl'), h('span', {}, 'model'), h('span', {}, 'API key'), h('span', {})),
    ...list.map((p, i) => h('div', { class: 'provider-row', dataset: { i } },
      h('input', { value: p.name, dataset: { f: 'name' } }),
      h('select', { dataset: { f: 'type' } }, ...TYPES.map(t => h('option', { selected: t === p.type }, t))),
      h('input', { value: p.baseurl, dataset: { f: 'baseurl' }, placeholder: 'https://…' }),
      h('input', { value: p.model, dataset: { f: 'model' } }),
      h('input', { value: p.apiKey, dataset: { f: 'apiKey' }, type: 'password', placeholder: '(選填)' }),
      h('button', { class: 'danger icon-btn', onclick: () => { list.splice(i, 1); saveProviders(list, $('#remember-keys').checked); renderSettings(); } }, '刪'),
    )),
  );
}

$('#add-provider').onclick = () => {
  const list = loadProviders();
  list.push({ name: '新端點 ' + (list.length + 1), type: 'openai-compatible', baseurl: '', model: '', apiKey: '' });
  saveProviders(list, $('#remember-keys').checked);
  renderSettings();
};

$('#save-providers').onclick = () => {
  const rows = document.querySelectorAll('#provider-list .provider-row[data-i]');
  const list = [...rows].map(row => {
    const get = f => row.querySelector(`[data-f="${f}"]`).value.trim();
    return { name: get('name'), type: get('type'), baseurl: get('baseurl'), model: get('model'), apiKey: get('apiKey') };
  });
  saveProviders(list, $('#remember-keys').checked);
  toast($('#remember-keys').checked ? '已儲存(含 key,存於此瀏覽器)' : '已儲存(key 僅在本分頁有效)');
  if (app.meta) fillProjectForm();
};

renderProject();
