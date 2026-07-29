// 專案儲存:File System Access API,專案=本機資料夾。
// 格式見 docs/superpowers/specs/。Chromium-only。

let root = null; // FileSystemDirectoryHandle

export function hasProject() { return !!root; }
export function projectName() { return root ? root.name : ''; }

export async function openProject() {
  root = await window.showDirectoryPicker({ mode: 'readwrite' });
  return root.name;
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
