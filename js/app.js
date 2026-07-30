// 工作台入口:tab 路由、專案站、模型設定站;其餘站各自模組。
import { $, h, toast } from './ui.js';
import * as store from './store.js';
import * as data from './data.js';
import { loadProviders, saveProviders, isPersisted, applyProjectKeys } from './providers.js';
import { refreshStoryboard } from './storyboard.js';
import { refreshCharacters } from './characters.js';
import { refreshGenerate } from './generate.js';
import { refreshLayout } from './layout.js';

export const app = { meta: null }; // 全站共享:專案 meta

// ── tab 路由 ──
const refreshers = {
  storyboard: refreshStoryboard,
  characters: refreshCharacters,
  generate: refreshGenerate,
  layout: refreshLayout,
  settings: renderSettings,
};
document.querySelectorAll('#tabs button').forEach(btn => {
  btn.onclick = async () => {
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tab').forEach(s => s.classList.toggle('active', s.id === 'tab-' + btn.dataset.tab));
    const fn = refreshers[btn.dataset.tab];
    if (fn) {
      if (btn.dataset.tab !== 'settings' && !store.hasProject()) { toast('請先在「專案」開啟資料夾'); }
      else await fn();
    }
  };
});

// ── 專案站 ──
$('#open-project').onclick = async () => {
  if (!window.showDirectoryPicker) { toast('此瀏覽器不支援 File System Access,請用 Chrome / Edge'); return; }
  try {
    const name = await store.openProject();
    $('#project-badge').textContent = '專案:' + name;
    app.meta = await data.loadMeta();
    if (!app.meta.title) app.meta.title = name;
    const nKeys = applyProjectKeys(await store.readJSON('keys.json', null));
    fillProjectForm();
    $('#project-form').hidden = false;
    toast(nKeys ? `專案已開啟(keys.json 帶入 ${nKeys} 把 key)` : '專案已開啟');
  } catch (e) {
    if (e.name !== 'AbortError') toast('開啟失敗:' + e.message);
  }
};

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

// ── 模型設定站 ──
const TYPES = ['codex-image-service', 'gemini-web', 'openai-compatible'];

function renderSettings() {
  const list = loadProviders();
  $('#remember-keys').checked = isPersisted();
  const box = $('#provider-list');
  box.replaceChildren(
    h('div', { class: 'provider-row hint' }, h('span', {}, '名稱'), h('span', {}, '類型'), h('span', {}, 'baseurl'), h('span', {}, 'model'), h('span', {}, 'API key'), h('span', {})),
    ...list.map((p, i) => h('div', { class: 'provider-row', dataset: { i } },
      h('input', { value: p.name, dataset: { f: 'name' } }),
      h('select', { dataset: { f: 'type' } }, ...TYPES.map(t => h('option', { selected: t === p.type }, t))),
      h('input', { value: p.baseurl, dataset: { f: 'baseurl' }, placeholder: 'https://…' }),
      h('input', { value: p.model, dataset: { f: 'model' } }),
      h('input', { value: p.apiKey, dataset: { f: 'apiKey' }, type: 'password', placeholder: '(選填)' }),
      h('button', { class: 'danger', onclick: () => { list.splice(i, 1); saveProviders(list, $('#remember-keys').checked); renderSettings(); } }, '刪'),
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
