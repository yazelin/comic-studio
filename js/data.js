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

// 世界風土庫:場景、道具、風土素材。跟角色庫同形狀(world/<id>/card.json + ref.png),
// 差別是它不是人——分鏡用 panel.world 指名,生圖時當「這一格的場景/道具鎖」附上去。
// 沒有它的話同一個公會大廳每格都會重抽一個樣子。
// 畫風錨:一張已完成、風格對的圖。參考圖掛零的格(空鏡、微距、地面、燒掉的林子)
// 沒有任何東西壓著畫風,一路往寫實照片跑——淺景深散景、真實質感,跟前後格不像同一部作品。
// 專案可放 style-anchor.png 在根目錄指定;沒有就不附(不亂猜一張角色圖,免得把角色帶進空鏡)。
export async function styleAnchorDataURL() {
  try {
    return 'data:image/png;base64,' + await store.readBlobB64('style-anchor.png');
  } catch { return null; }
}

export async function listWorld() {
  const entries = await store.listDir('world');
  const out = [];
  for (const e of entries.filter(e => e.kind === 'directory')) {
    const card = await store.readJSON(`world/${e.name}/card.json`, null);
    if (card) out.push(card);
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export async function saveWorld(card) {
  await store.writeJSON(`world/${card.id}/card.json`, card);
}

// 平面配置圖:同一個空間有很多格、每格機位不同,單張正視參考圖擋不住漂移——
// 窗戶、家具、掛飾的位置會每格重抽。平面圖把「這個空間有什麼、彼此的相對位置」
// 一次講完,再配上 panel.camera 指名這一格從哪個機位拍。
// 場次表放章節的 chapter.json 的 scenes 陣列(不另開檔:一章一份,跟 title/extras 同層)
export async function listScenes(dir) {
  const ch = await store.readJSON(chapterPath(dir, 'chapter.json'), null);
  return (ch && ch.scenes) || [];
}

export async function worldPlanDataURL(id) {
  try {
    return 'data:image/png;base64,' + await store.readBlobB64(`world/${id}/plan.png`);
  } catch { return null; }
}

export async function worldRefDataURL(id) {
  try {
    return 'data:image/png;base64,' + await store.readBlobB64(`world/${id}/ref.png`);
  } catch { return null; }
}

export async function saveCharacter(card) {
  await store.writeJSON(`characters/${card.id}/card.json`, card);
}

// 角色設定表:立繪(長相服裝)/表情集(情緒)/動作集(體態)——生圖時依該格需要挑著附
export const CHAR_SHEETS = [
  { key: 'ref', file: 'ref.png', label: '立繪' },
  { key: 'expr', file: 'expr.png', label: '表情集' },
  { key: 'pose', file: 'pose.png', label: '動作集' },
];

export async function charSheetURL(id, file) {
  return store.readBlobURL(`characters/${id}/${file}`);
}
export async function charSheetDataURL(id, file) {
  try {
    return 'data:image/png;base64,' + await store.readBlobB64(`characters/${id}/${file}`);
  } catch { return null; }
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
