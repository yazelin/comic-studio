// 專案資料層:把 store.js 的檔案操作組成領域物件。
import * as store from './store.js';

export const DEFAULT_META = {
  title: '',
  style: '黑白日式漫畫風格,精細線稿,網點陰影,高對比',
  providers: { image: '', text: '' },
};

export async function loadMeta() {
  return await store.readJSON('project.json', null) || structuredClone(DEFAULT_META);
}
export async function saveMeta(meta) {
  await store.writeJSON('project.json', meta);
}

export async function listChapters() {
  const entries = await store.listDir('chapters');
  const out = [];
  for (const e of entries.filter(e => e.kind === 'directory').sort((a, b) => a.name.localeCompare(b.name))) {
    const meta = await store.readJSON(`chapters/${e.name}/chapter.json`, {});
    out.push({ dir: e.name, title: meta.title || e.name });
  }
  return out;
}

export async function newChapter(title) {
  const existing = await listChapters();
  // 最大編號+1,不是數量+1——中間刪過章節時數量+1 會撞號蓋掉舊章
  const max = existing.reduce((m, c) => Math.max(m, parseInt(c.dir, 10) || 0), 0);
  const n = String(max + 1).padStart(2, '0');
  await store.writeJSON(`chapters/${n}/chapter.json`, { title });
  return n;
}

export const chapterPath = (dir, file) => `chapters/${dir}/${file}`;

export async function loadStoryboard(dir) {
  return store.readJSON(chapterPath(dir, 'storyboard.json'), { panels: [] });
}
export async function saveStoryboard(dir, sb) {
  await store.writeJSON(chapterPath(dir, 'storyboard.json'), sb);
}

export async function listCharacters() {
  const entries = await store.listDir('characters');
  const out = [];
  for (const e of entries.filter(e => e.kind === 'directory')) {
    const card = await store.readJSON(`characters/${e.name}/card.json`, null);
    if (card) out.push(card);
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export async function saveCharacter(card) {
  await store.writeJSON(`characters/${card.id}/card.json`, card);
}

export async function charRefURL(id) {
  return store.readBlobURL(`characters/${id}/ref.png`);
}
export async function charRefDataURL(id) {
  try {
    const b64 = await store.readBlobB64(`characters/${id}/ref.png`);
    return 'data:image/png;base64,' + b64;
  } catch {
    return null;
  }
}

export async function loadPanelState(dir, panelId) {
  return store.readJSON(chapterPath(dir, `panels/${panelId}/panel.json`), { chosen: '', bubbles: [] });
}
export async function savePanelState(dir, panelId, st) {
  await store.writeJSON(chapterPath(dir, `panels/${panelId}/panel.json`), st);
}
export async function listCandidates(dir, panelId) {
  const entries = await store.listDir(chapterPath(dir, `panels/${panelId}`));
  return entries.filter(e => e.kind === 'file' && /^cand-\d+\.png$/.test(e.name)).map(e => e.name).sort();
}
export async function panelImageURL(dir, panelId, name) {
  return store.readBlobURL(chapterPath(dir, `panels/${panelId}/${name}`));
}
