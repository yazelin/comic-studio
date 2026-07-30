// 純邏輯:把專案資料組成「PWA 漫畫電子書」的檔案清單。
// 回傳 [{path, content}](文字檔);圖檔 blob 由呼叫端自行複製,
// 但 precache 清單在這裡就要含所有圖檔路徑,漏一張離線就破功。

export function buildReaderFiles({ title, chapters }) {
  const data = {
    title,
    chapters: chapters.map(ch => ({
      title: ch.title,
      panels: ch.panels.map(p => ({ image: p.image, bubbles: p.bubbles || [], effects: p.effects || [] })),
    })),
  };

  const textFiles = [
    { path: 'index.html', content: readerHtml(title) },
    { path: 'reader.css', content: READER_CSS },
    { path: 'reader.js', content: READER_JS },
    { path: 'data.json', content: JSON.stringify(data, null, 1) },
    { path: 'manifest.json', content: JSON.stringify({
        name: title, short_name: title, start_url: './', scope: './',
        display: 'standalone', background_color: '#111114', theme_color: '#111114',
        icons: [
          { src: './icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: './icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      }, null, 1) },
  ];

  const imagePaths = data.chapters.flatMap(ch => ch.panels.flatMap(p => ['./' + p.image, ...(p.effects || []).map(f => './' + f.image)]));
  const precache = [
    './',
    ...textFiles.map(f => './' + f.path),
    './sw.js',
    './icon-192.png',
    './icon-512.png',
    ...imagePaths,
  ];
  textFiles.push({ path: 'sw.js', content: swJs(precache, title) });
  return textFiles;
}

function readerHtml(title) {
  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<link rel="manifest" href="./manifest.json">
<link rel="icon" href="./icon-192.png">
<meta name="theme-color" content="#111114">
<link rel="stylesheet" href="./reader.css">
</head>
<body>
<header id="topbar"><button id="menu-btn" aria-label="目錄">目錄</button><h1 id="book-title">${esc(title)}</h1></header>
<nav id="toc" hidden></nav>
<main id="stage"></main>
<script>
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
</script>
<script src="./reader.js"></script>
</body>
</html>
`;
}

function swJs(precache, title) {
  return `// ${esc(title)} — 離線快取(全量 precache + ignoreSearch)
const CACHE = 'comic-v1';
const PRECACHE = ${JSON.stringify(precache, null, 1)};
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request)));
});
`;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const READER_CSS = `:root { color-scheme: dark; }
* { margin: 0; box-sizing: border-box; }
body { background: #111114; color: #eee; font-family: "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif; }
#topbar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: .8rem; padding: .6rem 1rem; background: rgba(17,17,20,.92); backdrop-filter: blur(6px); }
#topbar h1 { font-size: 1rem; font-weight: 600; }
#menu-btn { background: #2a2a30; color: #eee; border: 1px solid #444; border-radius: 6px; padding: .35rem .8rem; font-size: .9rem; cursor: pointer; }
#toc { position: fixed; inset: 3.2rem 0 0 0; z-index: 9; background: #16161a; padding: 1rem; overflow-y: auto; }
#toc a { display: block; padding: .8rem 1rem; color: #eee; text-decoration: none; border-bottom: 1px solid #26262c; font-size: 1.05rem; }
#stage { max-width: 720px; margin: 0 auto; padding-bottom: 4rem; }
.chapter-title { padding: 2.2rem 1rem 1.2rem; font-size: 1.2rem; font-weight: 700; color: #bbb; }
.panel { position: relative; margin: 0 0 6px; }
.panel > img { display: block; width: 100%; height: auto; }
.fx { position: absolute; transform: translate(-50%, -50%); pointer-events: none; }
.bubble { position: absolute; transform: translate(-50%, -50%); background: #fff; color: #111; padding: .5em .8em; border-radius: 1em; font-family: "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif; font-size: clamp(11px, 2.6vw, 17px); line-height: 1.6; letter-spacing: .02em; max-width: 46%; box-shadow: 0 1px 4px rgba(0,0,0,.35); }
.bubble.thought { background: none; box-shadow: none; border: none; color: #1c1a17; font-weight: 500; text-shadow: 0 0 6px #fff, 0 0 3px #fff, 0 0 1px #fff, 0 0 10px rgba(255,255,255,.8); }
.bubble.narration { background: rgba(16,16,20,.72); color: #f2f0ea; border-radius: 3px; border: none; padding: .55em .9em; font-weight: 400; }
.bubble.sfx { background: none; box-shadow: none; color: #111; font-weight: 900; font-size: clamp(20px, 5vw, 34px); letter-spacing: .06em; transform: translate(-50%,-50%) rotate(-6deg); text-shadow: 1px 1px 0 #fff, -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff; }
.bubble .spk { display: block; font-size: .72em; color: #888; margin-bottom: .15em; }
#progress-hint { text-align: center; color: #666; padding: 2rem 0; font-size: .85rem; }
`;

const READER_JS = `(async () => {
  const res = await fetch('./data.json');
  const book = await res.json();
  const stage = document.getElementById('stage');
  const toc = document.getElementById('toc');
  const KEY = 'comic-progress:' + book.title;

  book.chapters.forEach((ch, ci) => {
    const a = document.createElement('a');
    a.href = '#ch' + ci;
    a.textContent = ch.title;
    a.onclick = () => { toc.hidden = true; };
    toc.appendChild(a);

    const h = document.createElement('div');
    h.className = 'chapter-title';
    h.id = 'ch' + ci;
    h.textContent = ch.title;
    stage.appendChild(h);

    ch.panels.forEach((p, pi) => {
      const wrap = document.createElement('div');
      wrap.className = 'panel';
      wrap.dataset.pos = ci + ':' + pi;
      const img = document.createElement('img');
      img.src = './' + p.image;
      img.loading = 'lazy';
      img.alt = '';
      wrap.appendChild(img);
      for (const f of (p.effects || [])) {
        const fx = document.createElement('img');
        fx.className = 'fx';
        fx.src = './' + f.image;
        fx.loading = 'lazy';
        fx.alt = '';
        fx.style.left = f.x + '%';
        fx.style.top = f.y + '%';
        fx.style.width = (f.w || 60) + '%';
        fx.style.transform = 'translate(-50%,-50%) rotate(' + (f.rot || 0) + 'deg)';
        fx.style.opacity = String((f.op == null ? 100 : f.op) / 100);
        fx.style.mixBlendMode = f.blend === 'normal' ? 'normal' : (f.blend || 'multiply');
        wrap.appendChild(fx);
      }
      for (const b of p.bubbles) {
        const el = document.createElement('div');
        el.className = 'bubble ' + (b.type || 'speech');
        el.style.left = b.x + '%';
        el.style.top = b.y + '%';
        if (b.w) el.style.maxWidth = b.w + '%';
        if (b.speaker && (b.type || 'speech') !== 'narration') {
          const s = document.createElement('span');
          s.className = 'spk';
          s.textContent = b.speaker;
          el.appendChild(s);
        }
        el.appendChild(document.createTextNode(b.text));
        wrap.appendChild(el);
      }
      stage.appendChild(wrap);
    });
  });

  const hint = document.createElement('div');
  hint.id = 'progress-hint';
  hint.textContent = '— 完 —';
  stage.appendChild(hint);

  document.getElementById('menu-btn').onclick = () => { toc.hidden = !toc.hidden; };

  // 進度記憶:回到上次看到的格
  const saved = localStorage.getItem(KEY);
  if (saved) {
    const el = document.querySelector('[data-pos="' + saved + '"]');
    if (el) requestAnimationFrame(() => el.scrollIntoView());
  }
  const io = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) localStorage.setItem(KEY, e.target.dataset.pos);
  }, { threshold: 0.4 });
  document.querySelectorAll('.panel').forEach(el => io.observe(el));
})();
`;
