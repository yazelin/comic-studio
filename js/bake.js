// 匯出站:整格重繪(排版文字畫進圖)+ PWA 電子書
// 排版(第6步)是工作台,這裡是出版動作:每格拿「選定圖+氣泡內容與方位」請生圖模型整張重畫。
import { $, h, toast, setStatus, lightbox, emptyState } from './ui.js';
import * as store from './store.js';
import * as data from './data.js';
import { getProvider, generateImages } from './providers.js';
import { buildBakePrompt } from './prompt.js';
import { buildReaderFiles } from './export.js';
import { app, requireProject } from './app.js';

const BAKE_DIR = '匯出';
// ponytail: 尺寸寫死直式 2:3;要別的比例時再開設定
const BAKE_SIZE = '1024x1536';
let stopBake = false;

const bakePath = (dir, pid) => data.chapterPath(dir, `${BAKE_DIR}/${pid}.png`);

export async function refreshBake() {
  const box = $('#bk-panels');
  if (!requireProject(box)) { $('#bk-toolbar').hidden = true; return; }
  $('#bk-toolbar').hidden = false;
  await render();
}

async function bakedURL(dir, pid) {
  try { return await store.readBlobURL(bakePath(dir, pid)); } catch { return null; }
}

async function render() {
  const box = $('#bk-panels');
  if (!app.chapter) { box.replaceChildren(emptyState('還沒有章節。')); return; }
  const sb = await data.loadStoryboard(app.chapter);
  const nodes = [];
  for (const p of sb.panels) {
    const st = await data.loadPanelState(app.chapter, p.id);
    if (!st.chosen) continue;
    nodes.push(await renderPanel(p, st));
  }
  box.replaceChildren(...(nodes.length ? nodes : [emptyState('此章還沒有「已選定」的格圖,先到「生圖」與「排版」。')]));
}

async function renderPanel(p, st) {
  const baked = await bakedURL(app.chapter, p.id);
  const tag = baked ? '已重繪' : (st.bubbles.length ? '待重繪' : '無字(直接用選定圖)');
  const wrap = h('div', { class: 'bk-panel' },
    h('div', { class: 'bk-head' },
      h('span', { class: 'pnum' }, String(p.order)),
      h('span', { class: 'bk-tag' + (baked ? ' ok' : '') }, tag),
      h('button', { onclick: () => bakeOne(p, st, true).then(render) }, baked ? '重繪這格' : '重繪'),
    ),
  );
  const url = baked || await data.panelImageURL(app.chapter, p.id, st.chosen);
  if (url) {
    const img = h('img', { src: url, class: baked ? '' : 'bk-dim', onclick: () => lightbox(url) });
    wrap.append(img);
  }
  return wrap;
}

// 字體錨:本章 order 最小、已烙且有字的格(排除自己)——之後每格的字都照它畫,整章自動統一
async function fontAnchor(excludeId) {
  const sb = await data.loadStoryboard(app.chapter);
  for (const p of sb.panels) {
    if (p.id === excludeId) continue;
    const st = await data.loadPanelState(app.chapter, p.id);
    if (!st.bubbles.length) continue;
    try { return 'data:image/png;base64,' + await store.readBlobB64(bakePath(app.chapter, p.id)); } catch { continue; }
  }
  return null;
}

// 烙一格。無字=直接複製選定圖;有字=image-edit 整張重繪。回傳 'copied'|'baked'|'skipped'
async function bakeOne(p, st, force = false) {
  if (!force && await bakedURL(app.chapter, p.id)) return 'skipped';
  const src = data.chapterPath(app.chapter, `panels/${p.id}/${st.chosen}`);
  if (!st.bubbles.length) {
    const b64 = await store.readBlobB64(src);
    await store.writeBlob(bakePath(app.chapter, p.id), store.dataURLtoBlob('data:image/png;base64,' + b64));
    return 'copied';
  }
  const provider = getProvider(app.meta?.providers.image);
  if (!provider) throw new Error('未設定生圖模型(到「專案」選擇)');
  const ref = 'data:image/png;base64,' + await store.readBlobB64(src);
  const refs = [ref];
  const anchor = await fontAnchor(p.id);
  if (anchor) refs.push(anchor);
  const imgs = await generateImages({
    provider,
    prompt: buildBakePrompt(st.bubbles, { fontRef: !!anchor }),
    refDataURLs: refs,
    count: 1,
    size: BAKE_SIZE,
    onStatus: m => setStatus('#bk-status', `格 ${p.order}:${m}`),
  });
  if (!imgs.length) throw new Error('沒有回傳圖片');
  await store.writeBlob(bakePath(app.chapter, p.id), store.dataURLtoBlob(imgs[0]));
  return 'baked';
}

$('#bk-all').onclick = async () => {
  if (!app.chapter) return;
  stopBake = false;
  const sb = await data.loadStoryboard(app.chapter);
  let done = 0, skipped = 0, failed = 0;
  for (const p of sb.panels) {
    if (stopBake) break;
    const st = await data.loadPanelState(app.chapter, p.id);
    if (!st.chosen) continue;
    try {
      const r = await bakeOne(p, st);
      if (r === 'skipped') skipped += 1; else done += 1;
      setStatus('#bk-status', `進度:完成 ${done}、略過 ${skipped}、失敗 ${failed}(格 ${p.order})`);
    } catch (e) {
      failed += 1;
      setStatus('#bk-status', `格 ${p.order} 失敗:${e.message}`, true);
    }
  }
  await render();
  setStatus('#bk-status', stopBake ? `已停止:完成 ${done}、略過 ${skipped}、失敗 ${failed}` : `整章完成:重繪 ${done}、略過 ${skipped}、失敗 ${failed}。逐格檢查錯字,不滿意就單格重繪。`, !!failed);
};

$('#bk-stop').onclick = () => { stopBake = true; };
$('#bk-refresh').onclick = () => render();

// ── 匯出 PWA 電子書:已重繪的格用重繪圖(文字在圖裡,氣泡不再疊);其餘退回選定圖+疊字 ──
$('#do-export').onclick = async () => {
  if (!app.meta) { toast('請先開啟專案'); return; }
  try {
    setStatus('#export-status', '收集章節資料…');
    const chapters = [];
    const imageBlobs = [];
    for (const ch of await data.listChapters()) {
      const sb = await data.loadStoryboard(ch.dir);
      const panels = [];
      for (const p of sb.panels) {
        const st = await data.loadPanelState(ch.dir, p.id);
        if (!st.chosen) continue;
        let url = null, bubbles = st.bubbles;
        try {
          url = await store.readBlobURL(bakePath(ch.dir, p.id));
          bubbles = []; // 文字已在圖裡
        } catch {
          url = await data.panelImageURL(ch.dir, p.id, st.chosen);
        }
        if (!url) continue;
        const blob = await (await fetch(url)).blob();
        const path = `imgs/ch${ch.dir}-${p.id}.png`;
        imageBlobs.push({ path, blob });
        const effects = [];
        for (const [fi, fx] of (st.effects || []).entries()) {
          const fu = await data.panelImageURL(ch.dir, p.id, fx.image);
          if (!fu) continue;
          const fpath = `imgs/ch${ch.dir}-${p.id}-fx${fi + 1}.png`;
          imageBlobs.push({ path: fpath, blob: await (await fetch(fu)).blob() });
          effects.push({ ...fx, image: fpath });
        }
        panels.push({ image: path, bubbles, effects });
      }
      if (panels.length) chapters.push({ title: ch.title, panels });
    }
    if (!chapters.length) { setStatus('#export-status', '沒有任何已選定格圖,無可匯出', true); return; }

    // 角色頁素材:名字+文字卡+ref 圖
    const characters = [];
    for (const c of await data.listCharacters()) {
      if (c.hidden) continue; // 伏筆角色:生圖照用,但不上公開角色牆
      let image = null;
      try {
        const b64 = await store.readBlobB64(`characters/${c.id}/ref.png`);
        image = `imgs/char-${c.id}.png`;
        imageBlobs.push({ path: image, blob: store.dataURLtoBlob('data:image/png;base64,' + b64) });
      } catch { /* 沒 ref 圖就純文字頁 */ }
      const sheets = [];
      for (const s of data.CHAR_SHEETS) {
        if (s.key === 'ref') continue;
        try {
          const b64 = await store.readBlobB64(`characters/${c.id}/${s.file}`);
          const path = `imgs/char-${c.id}-${s.key}.png`;
          imageBlobs.push({ path, blob: store.dataURLtoBlob('data:image/png;base64,' + b64) });
          sheets.push({ label: s.label, image: path });
        } catch { /* 沒這張設定表就不放 */ }
      }
      characters.push({ id: c.id, name: c.name, card: c.card || '', bio: c.bio || '', image, sheets });
    }
    // 封面(專案根 cover.png,可選)
    let cover = null;
    let ogBlob = null;
    try {
      const b64 = await store.readBlobB64('cover.png');
      cover = 'imgs/cover.png';
      const coverBlob = store.dataURLtoBlob('data:image/png;base64,' + b64);
      imageBlobs.push({ path: cover, blob: coverBlob });
      ogBlob = await makeOg(coverBlob);   // 社群分享圖:1.91:1 JPEG,沒封面就沒有(退回 icon)
    } catch { /* 沒封面就文字 hero,也沒有 og 大圖 */ }

    setStatus('#export-status', '寫入 dist/ …');
    // 自架字型:從工作台自己的 assets 抓一份塞進 dist,匯出站才不吃使用者裝置有沒有裝中文字型
    let fontBlob = null;
    try {
      const r = await fetch(new URL('../assets/fonts/comic-tc.woff2', import.meta.url));
      if (r.ok) fontBlob = await r.blob();
    } catch { /* 抓不到就退回系統字型堆疊,不擋匯出 */ }
    const totalBytes = imageBlobs.reduce((n, im) => n + im.blob.size, 0);
    const files = buildReaderFiles({ title: app.meta.title, chapters, characters, site: app.meta.site || {}, cover, assetsVersion: imageBlobs.length + '-' + totalBytes, fontPath: fontBlob ? 'fonts/comic-tc.woff2' : null, ogPath: ogBlob ? 'og.jpg' : null });
    for (const f of files) await store.writeText('dist/' + f.path, f.content);
    for (const im of imageBlobs) await store.writeBlob('dist/' + im.path, im.blob);
    if (fontBlob) await store.writeBlob('dist/fonts/comic-tc.woff2', fontBlob);
    if (ogBlob) await store.writeBlob('dist/og.jpg', ogBlob);
    for (const size of [192, 512]) await store.writeBlob(`dist/icon-${size}.png`, await makeIcon(app.meta.title, size));
    // maskable:Android 會在外面套遮罩,安全區是中央 80%。makeIcon 的字本來就只佔 55%,
    // 但要再縮一階,遮罩切到圓角時字才不會貼邊。manifest 指名要這個檔,少了會 404。
    await store.writeBlob('dist/icon-maskable-512.png', await makeIcon(app.meta.title, 512, 0.42));

    const total = files.length + imageBlobs.length + 2 + (fontBlob ? 1 : 0) + (ogBlob ? 1 : 0);
    setStatus('#export-status', `完成:dist/ 共 ${total} 個檔、${chapters.length} 章。`
      + (fontBlob ? '' : '(警告:字型沒複製進去,讀者裝置沒中文字型時排版會跑掉)')
      + '丟到任何靜態空間即可離線閱讀。');
  } catch (e) {
    setStatus('#export-status', '匯出失敗:' + e.message, true);
  }
};

// 社群分享圖:等比放大到蓋滿 1200x630 再裁,錨點偏上(1/3)免得裁掉臉。
// 與 tools/make-og.mjs 的 ffmpeg 版同一套裁法,CLI 與 UI 匯出結果一致。
async function makeOg(coverBlob) {
  const W = 1200, H = 630;
  const bmp = await createImageBitmap(coverBlob);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const scale = Math.max(W / bmp.width, H / bmp.height);
  const w = bmp.width * scale, h = bmp.height * scale;
  ctx.drawImage(bmp, (W - w) / 2, (H - h) / 3, w, h);
  return new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.88));
}

async function makeIcon(title, size, ratio = 0.55) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#101013';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#eceae4';
  // canvas 不會自己觸發 webfont 載入,沒先 load 就會用系統字畫出來
  await document.fonts.load(`700 ${size * ratio}px "Comic TC"`).catch(() => {});
  ctx.font = `700 ${size * ratio}px 'Comic TC', "Noto Sans TC", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText((title || '漫').slice(0, 1), size / 2, size / 2 + size * ratio * 0.055);
  return new Promise(ok => c.toBlob(ok, 'image/png'));
}
