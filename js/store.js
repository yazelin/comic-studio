// 專案儲存:File System Access API,專案=本機資料夾。
// 格式見 docs/superpowers/specs/。Chromium-only。

let root = null; // FileSystemDirectoryHandle

export function hasProject() { return !!root; }
export function projectName() { return root ? root.name : ''; }

export async function openProject() {
  root = await window.showDirectoryPicker({ mode: 'readwrite' });
  await idbPut('projectHandle', root); // 記住,reload 後可一鍵重連
  return root.name;
}

// reload 後:有記住的專案就回傳名字(還不能直接用,要 user 手勢授權)
export async function savedProjectName() {
  const handle = await idbGet('projectHandle');
  return handle ? handle.name : null;
}

// 必須在 user 手勢(按鈕點擊)內呼叫:重新要回授權
export async function restoreProject() {
  const handle = await idbGet('projectHandle');
  if (!handle) throw new Error('沒有記住的專案');
  const perm = await handle.requestPermission({ mode: 'readwrite' });
  if (perm !== 'granted') throw new Error('未授權資料夾存取');
  root = handle;
  return root.name;
}

// ── 極簡 IndexedDB kv(存 FSA handle 用;localStorage 存不了物件 handle)──
function idb() {
  return new Promise((ok, bad) => {
    const req = indexedDB.open('comic-studio', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => ok(req.result);
    req.onerror = () => bad(req.error);
  });
}
async function idbPut(key, val) {
  const db = await idb();
  return new Promise((ok, bad) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(val, key);
    tx.oncomplete = ok;
    tx.onerror = () => bad(tx.error);
  });
}
async function idbGet(key) {
  const db = await idb();
  return new Promise((ok, bad) => {
    const req = db.transaction('kv').objectStore('kv').get(key);
    req.onsuccess = () => ok(req.result || null);
    req.onerror = () => bad(req.error);
  });
}

async function dir(path, create = false) {
  let d = root;
  for (const part of path.split('/').filter(Boolean)) {
    d = await d.getDirectoryHandle(part, { create });
  }
  return d;
}

export async function readJSON(path, fallback = null) {
  try {
    const parts = path.split('/');
    const name = parts.pop();
    const d = await dir(parts.join('/'));
    const fh = await d.getFileHandle(name);
    const file = await fh.getFile();
    return JSON.parse(await file.text());
  } catch {
    return fallback;
  }
}

export async function readText(path, fallback = null) {
  try {
    const parts = path.split('/');
    const name = parts.pop();
    const d = await dir(parts.join('/'));
    const fh = await d.getFileHandle(name);
    return await (await fh.getFile()).text();
  } catch {
    return fallback;
  }
}

export async function writeJSON(path, obj) {
  await writeText(path, JSON.stringify(obj, null, 1));
}

export async function writeText(path, text) {
  await writeBlob(path, new Blob([text], { type: 'text/plain' }));
}

export async function writeBlob(path, blob) {
  const parts = path.split('/');
  const name = parts.pop();
  const d = await dir(parts.join('/'), true);
  const fh = await d.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(blob);
  await w.close();
}

export async function readBlobURL(path) {
  try {
    const parts = path.split('/');
    const name = parts.pop();
    const d = await dir(parts.join('/'));
    const fh = await d.getFileHandle(name);
    const file = await fh.getFile();
    return URL.createObjectURL(file);
  } catch {
    return null;
  }
}

export async function readBlobB64(path) {
  const parts = path.split('/');
  const name = parts.pop();
  const d = await dir(parts.join('/'));
  const fh = await d.getFileHandle(name);
  const file = await fh.getFile();
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
  return btoa(bin);
}

export async function listDir(path) {
  try {
    const d = await dir(path);
    const names = [];
    for await (const [name, handle] of d.entries()) names.push({ name, kind: handle.kind });
    return names;
  } catch {
    return [];
  }
}

export async function removeEntry(path) {
  try {
    const parts = path.split('/');
    const name = parts.pop();
    const d = await dir(parts.join('/'));
    await d.removeEntry(name, { recursive: true });
  } catch { /* 不存在就算了 */ }
}

// dataURL 轉 Blob(生圖結果落檔用)
export function dataURLtoBlob(dataURL) {
  const [head, b64] = dataURL.split(',');
  const mime = (head.match(/data:([^;]+)/) || [])[1] || 'image/png';
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return new Blob([buf], { type: mime });
}
