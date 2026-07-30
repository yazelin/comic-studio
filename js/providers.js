// provider 設定管理+實際打 API。
// key 預設只留記憶體;勾「記住此瀏覽器」才寫 localStorage(共用 origin 紅線)。

import { buildCodexRequest, buildCodexPollRequest, buildGeminiWebRequest, buildOpenAIImageRequest, buildChatRequest } from './providers-core.js';

const LS_KEY = 'comic-studio:providers';

export const PRESETS = [
  // 注意:從 HTTPS 頁面(GitHub Pages)只能打 HTTPS 端點,http:// 內網位址會被瀏覽器 mixed content 擋下
  { name: 'codex-image-service', type: 'codex-image-service', baseurl: 'https://ching-tech.ddns.net/codex-image', model: 'gpt-image', apiKey: '' },
  { name: 'gemini-web', type: 'gemini-web', baseurl: 'https://ching-tech.ddns.net/gemini-web', model: 'gemini', apiKey: '' },
  { name: '自訂 OpenAI 相容', type: 'openai-compatible', baseurl: 'https://api.openai.com', model: 'gpt-image-1', apiKey: '' },
];

let providers = null;
let persist = false;

export function loadProviders() {
  if (providers) return providers;
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY));
    if (saved && Array.isArray(saved.list)) {
      providers = saved.list;
      persist = true;
      return providers;
    }
  } catch { /* 壞資料當沒存過 */ }
  providers = structuredClone(PRESETS);
  return providers;
}

export function saveProviders(list, remember) {
  providers = list;
  persist = remember;
  if (remember) localStorage.setItem(LS_KEY, JSON.stringify({ list }));
  else localStorage.removeItem(LS_KEY);
}

export function isPersisted() { return persist; }

// 專案資料夾的 keys.json({"provider 名稱": "key"})→ 只進記憶體,不進 localStorage。
// 回傳套用到幾個 provider。
export function applyProjectKeys(map) {
  if (!map || typeof map !== 'object') return 0;
  let n = 0;
  for (const p of loadProviders()) {
    if (typeof map[p.name] === 'string' && map[p.name]) {
      p.apiKey = map[p.name];
      n += 1;
    }
  }
  return n;
}

export function getProvider(name) {
  return loadProviders().find(p => p.name === name) || null;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function doFetch(req) {
  const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).detail || ''; } catch { /* 非 JSON 錯誤體 */ }
    throw new Error(`HTTP ${res.status} ${detail}`.trim());
  }
  return res.json();
}

// 多張參考圖 → 併成一張(gemini-web /api/edit 只吃單張)
export async function compositeRefs(dataURLs) {
  if (dataURLs.length <= 1) return dataURLs[0] || null;
  const imgs = await Promise.all(dataURLs.map(u => new Promise((ok, bad) => {
    const im = new Image();
    im.onload = () => ok(im);
    im.onerror = bad;
    im.src = u;
  })));
  const h = 768;
  const widths = imgs.map(im => Math.round(im.width * h / im.height));
  const canvas = document.createElement('canvas');
  canvas.width = widths.reduce((a, b) => a + b, 0);
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  let x = 0;
  imgs.forEach((im, i) => { ctx.drawImage(im, x, 0, widths[i], h); x += widths[i]; });
  return canvas.toDataURL('image/png');
}

const stripDataURL = u => u.replace(/^data:[^,]+,/, '');

// 統一入口:回傳 dataURL 陣列
export async function generateImages({ provider, prompt, refDataURLs = [], count = 1, size = '1024x1024', onStatus = () => {} }) {
  const { type, baseurl, apiKey, model } = provider;

  if (type === 'codex-image-service') {
    const refImagesB64 = refDataURLs.map(stripDataURL);
    onStatus('提交任務…');
    const sub = await doFetch(buildCodexRequest({ baseurl, apiKey, prompt, refImagesB64, count, size }));
    for (let i = 0; i < 180; i++) {
      await sleep(5000);
      const st = await doFetch(buildCodexPollRequest({ baseurl, apiKey, jobId: sub.id }));
      onStatus(`任務 ${st.status}…`);
      if (st.status === 'succeeded') {
        onStatus('下載圖片…');
        return Promise.all(st.images.map(async im => {
          const url = /^https?:/.test(im.url) ? im.url : baseurl.replace(/\/+$/, '') + im.url;
          const blob = await (await fetch(url)).blob();
          return blobToDataURL(blob);
        }));
      }
      if (st.status === 'failed' || st.status === 'expired') throw new Error(st.error || `任務 ${st.status}`);
    }
    throw new Error('輪詢逾時(15 分鐘)');
  }

  if (type === 'gemini-web') {
    const ref = await compositeRefs(refDataURLs);
    const results = [];
    for (let i = 0; i < count; i++) {
      onStatus(count > 1 ? `生成中 ${i + 1}/${count}…` : '生成中…');
      const r = await doFetch(buildGeminiWebRequest({ baseurl, apiKey, prompt, refImagesB64: ref ? [ref] : [] }));
      if (!r.success) throw new Error(r.error || '生成失敗');
      results.push(...r.images);
    }
    return results;
  }

  // openai-compatible
  onStatus('生成中…');
  const r = await doFetch(buildOpenAIImageRequest({ baseurl, apiKey, prompt, model, count, size }));
  return (r.data || []).map(d => d.b64_json ? 'data:image/png;base64,' + d.b64_json : d.url);
}

export async function chatText({ provider, prompt, onStatus = () => {} }) {
  const { type, baseurl, apiKey, model } = provider;
  onStatus('呼叫文字模型…');
  const r = await doFetch(buildChatRequest({ type, baseurl, apiKey, model, prompt }));
  if (type === 'gemini-web') {
    if (!r.success) throw new Error(r.error || '對話失敗');
    return r.text;
  }
  return r.choices?.[0]?.message?.content ?? '';
}

function blobToDataURL(blob) {
  return new Promise(ok => {
    const fr = new FileReader();
    fr.onload = () => ok(fr.result);
    fr.readAsDataURL(blob);
  });
}
