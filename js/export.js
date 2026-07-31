// 純邏輯:把專案資料組成「出版級 PWA 漫畫站」的檔案清單。
// 多頁靜態站:首頁(hero/續讀/章節列表/角色區)+ read/N.html 每章一頁(SEO/上一章下一章/進度條)
// + char/<id>.html 角色頁 + manifest + SHELL/ASSET 兩層快取 SW(版本=內容雜湊,自動 bump)
// + sitemap/robots(有 site.url 才生)。
// 回傳 [{path, content}](文字檔);圖檔 blob 由呼叫端複製,但 ASSET 快取清單在這裡就要含
// 所有圖檔路徑,漏一張離線就破功。
//
// site 設定(project.json 的 site 欄,全部可選):
//   { url, description, author, links:{github,facebook,coffee,novel}, storageKey }

const DEFAULT_COLORS = { bg: '#f4f1ea', ink: '#2a2622', dim: '#7a7266', line: 'rgba(0,0,0,.08)', accent: '#b98d2f', panelGap: '#e9e4d8' };

export function buildReaderFiles({ title, chapters, characters = [], site = {}, cover = null, assetsVersion = null }) {
  const KEY = 'comic-' + (site.storageKey || title);
  const C = { ...DEFAULT_COLORS, ...(site.colors || {}) };
  const files = [];
  const imagePaths = chapters.flatMap(ch => ch.panels.flatMap(p => [p.image, ...(p.effects || []).map(f => f.image)]));
  for (const c of characters) if (c.image) imagePaths.push(c.image);
  if (cover) imagePaths.push(cover);

  files.push({ path: 'style.css', content: `:root{--bg:${C.bg};--ink:${C.ink};--dim:${C.dim};--line:${C.line};--acc:${C.accent};--gap:${C.panelGap}}\n` + SITE_CSS });
  files.push({ path: 'app.js', content: appJs(KEY) });
  site = { ...site, _bg: C.bg };
  files.push({ path: 'index.html', content: indexHtml({ title, chapters, characters, site, cover }) });
  chapters.forEach((ch, i) => {
    files.push({ path: `read/${i + 1}.html`, content: readHtml({ title, chapters, i, site }) });
  });
  for (const c of characters) {
    files.push({ path: `char/${c.id}.html`, content: charHtml({ title, c, site }) });
  }
  files.push({ path: 'manifest.json', content: JSON.stringify({
    name: title, short_name: title, start_url: './', scope: './',
    display: 'standalone', background_color: C.bg, theme_color: C.bg,
    icons: [
      { src: './icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: './icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }, null, 1) });
  if (site.url) {
    const base = site.url.replace(/\/$/, '');
    const pages = ['', ...chapters.map((_, i) => `read/${i + 1}.html`), ...characters.map(c => `char/${c.id}.html`)];
    files.push({ path: 'sitemap.xml', content:
      '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
      + pages.map(p => ` <url><loc>${esc(base + '/' + p)}</loc></url>`).join('\n') + '\n</urlset>\n' });
    files.push({ path: 'robots.txt', content: `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n` });
  }

  // SW:SHELL=頁面殼(版本=殼內容雜湊,改版自動 bump);ASSET=圖(版本=路徑清單雜湊)。
  const shellPaths = ['./', ...files.map(f => './' + f.path), './icon-192.png', './icon-512.png'];
  const shellHash = hash(files.map(f => f.content).join(' '));
  // 圖換內容但檔名不變是常態(重烙同名格)——版本必須來自內容,否則舊快取蓋新圖
  const assetHash = assetsVersion || hash(imagePaths.join('\n'));
  files.push({ path: 'sw.js', content: swJs({ title, shellPaths, imagePaths: imagePaths.map(p => './' + p), shellHash, assetHash }) });
  return files;
}

// ── 頁面 ──

function head({ pageTitle, desc, path, site, extra = '' }) {
  const base = site.url ? site.url.replace(/\/$/, '') : null;
  const abs = base ? `${base}/${path}` : null;
  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(pageTitle)}</title>
${desc ? `<meta name="description" content="${esc(desc)}">` : ''}
${abs ? `<link rel="canonical" href="${esc(abs)}">
<meta property="og:site_name" content="${esc(site.siteName || pageTitle)}">
<meta property="og:locale" content="zh_TW">
<meta property="og:title" content="${esc(pageTitle)}">
${desc ? `<meta property="og:description" content="${esc(desc)}">` : ''}
<meta property="og:url" content="${esc(abs)}">
<meta property="og:image" content="${esc(base + '/icon-512.png')}">` : ''}
<link rel="manifest" href="${rel(path)}manifest.json">
<link rel="icon" href="${rel(path)}icon-192.png">
<meta name="theme-color" content="${site._bg}">
<link rel="stylesheet" href="${rel(path)}style.css">
${extra}
</head>
<body>`;
}

function footer(site, path) {
  const L = site.links || {};
  const a = (href, label) => href ? `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(label)}</a>` : '';
  const novel = L.novel ? `<p class="foot-novel"><a href="${esc(L.novel)}">原作小說</a></p>` : '';
  return `<footer class="site-foot">${novel}<p class="foot-links">${[a(L.github, 'GitHub'), a(L.facebook, 'Facebook'), a(L.coffee, '請我喝咖啡')].filter(Boolean).join('　')}</p>
<p class="foot-copy">© ${esc(site.author || '')}</p></footer>
<script src="${rel(path)}app.js"></script>
<script>if('serviceWorker' in navigator)navigator.serviceWorker.register('${rel(path)}sw.js');</script>
</body>
</html>
`;
}

function indexHtml({ title, chapters, characters, site, cover }) {
  const latest = chapters.length;
  const chList = chapters.map((ch, i) =>
    `  <li><a href="read/${i + 1}.html"><span class="n">${esc(numLabel(i, chapters.length))}</span><span class="t">${esc(ch.title)}</span></a></li>`).join('\n');
  const chars = characters.length
    ? `<section class="chars"><h2>角色</h2><div class="char-grid">` + characters.map(c =>
        `<a class="char-card" href="char/${esc(c.id)}.html">${c.image ? `<img src="${esc(c.image)}" alt="${esc(c.name)}" loading="lazy">` : ''}<span>${esc(c.name)}</span></a>`).join('') + `</div></section>`
    : '';
  return head({ pageTitle: title, desc: site.description, path: '', site })
    + `
<main class="home">
<section class="hero">${cover ? `<img class="cover" src="${esc(cover)}" alt="${esc(title)}">` : ''}
<h1>${esc(title)}</h1>
${site.description ? `<p class="hook">${esc(site.description)}</p>` : ''}
<p class="newest">最新:<a href="read/${latest}.html">${esc(chapters[latest - 1].title)}</a></p>
<div id="resume-slot"></div>
</section>
<section class="toc-sec"><h2>章節</h2><ul class="toc">
${chList}
</ul></section>
${chars}
</main>` + footer(site, '');
}

function readHtml({ title, chapters, i, site }) {
  const ch = chapters[i];
  const pageTitle = `${ch.title}|${title}`;
  const prev = i > 0 ? `<a href="${i}.html">‹ 上一章</a>` : '<span></span>';
  const next = i + 1 < chapters.length ? `<a href="${i + 2}.html">下一章 ›</a>` : '<span></span>';
  const panels = ch.panels.map((p, pi) => {
    const fx = (p.effects || []).map(f =>
      `<img class="fx" src="../${esc(f.image)}" alt="" loading="lazy" style="left:${f.x}%;top:${f.y}%;width:${f.w || 60}%;transform:translate(-50%,-50%) rotate(${f.rot || 0}deg);opacity:${(f.op == null ? 100 : f.op) / 100};mix-blend-mode:${f.blend === 'normal' ? 'normal' : (f.blend || 'multiply')}">`).join('');
    const bubbles = (p.bubbles || []).map(b => {
      const spk = b.speaker && (b.type || 'speech') !== 'narration' ? `<span class="spk">${esc(b.speaker)}</span>` : '';
      const fs = b.fs ? `font-size:${b.fs}cqw;` : '';
      return `<div class="bubble ${esc(b.type || 'speech')}" style="left:${b.x}%;top:${b.y}%;${b.w ? `max-width:${b.w}%;` : ''}${fs}">${spk}${esc(b.text)}</div>`;
    }).join('');
    return `<div class="panel" data-p="${pi}"><img src="../${esc(p.image)}" alt="" loading="lazy">${fx}${bubbles}</div>`;
  }).join('\n');
  return head({ pageTitle, desc: site.description, path: `read/${i + 1}.html`, site })
    + `
<nav class="reader-top"><a href="../index.html">目錄</a><b>${esc(ch.title)}</b>${i + 1 < chapters.length ? `<a href="${i + 2}.html">下一章</a>` : '<span></span>'}</nav>
<main class="reader" data-ep="${i + 1}" data-total="${ch.panels.length}">
${panels}
<nav class="reader-nav">${prev}<a href="../index.html">目錄</a>${next}</nav>
</main>
<div class="progress" aria-hidden="true"><i></i><span></span></div>` + footer(site, `read/${i + 1}.html`);
}

function charHtml({ title, c, site }) {
  const intro = c.bio || c.card || '';
  return head({ pageTitle: `${c.name}|${title}`, desc: intro.slice(0, 80), path: `char/${c.id}.html`, site })
    + `
<main class="char-page">
<nav class="reader-top"><a href="../index.html">目錄</a><b>${esc(c.name)}</b><span></span></nav>
${c.image ? `<img class="portrait" src="../${esc(c.image)}" alt="${esc(c.name)}">` : ''}
<h1>${esc(c.name)}</h1>
${intro ? `<p class="card-text">${esc(intro)}</p>` : ''}
</main>` + footer(site, `char/${c.id}.html`);
}

// ── SW:SHELL/ASSET 兩層 ──

function swJs({ title, shellPaths, imagePaths, shellHash, assetHash }) {
  return `// ${esc(title)} — 離線快取(SHELL/ASSET 兩層;版本=內容雜湊,自動 bump)
const SHELL = 'cs-shell-${shellHash}';
const ASSET = 'cs-asset-${assetHash}';
const SHELL_FILES = ${JSON.stringify(shellPaths, null, 1)};
const ASSET_FILES = ${JSON.stringify(imagePaths, null, 1)};
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const s = await caches.open(SHELL); await s.addAll(SHELL_FILES);
    const a = await caches.open(ASSET); await a.addAll(ASSET_FILES);
    self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k !== SHELL && k !== ASSET).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request)));
});
`;
}

// ── 前端行為:頂欄隱現、進度條、進度記憶、首頁續讀 ──

function appJs(KEY) {
  return `(function(){
'use strict';
var KEY=${JSON.stringify(KEY)};
function read(){try{return JSON.parse(localStorage.getItem(KEY))||null}catch(e){return null}}
function write(ep,p){try{localStorage.setItem(KEY,JSON.stringify({ep:ep,p:p,at:Date.now()}))}catch(e){}}
var reader=document.querySelector('main.reader');
if(reader){
  var ep=Number(reader.dataset.ep),total=Number(reader.dataset.total)||1;
  var bar=document.querySelector('.progress i'),cnt=document.querySelector('.progress span');
  var top=document.querySelector('.reader-top'),lastY=0;
  addEventListener('scroll',function(){
    var y=scrollY;
    if(top){ if(y>innerHeight&&y>lastY+8)top.classList.add('hide'); else if(y<lastY-8)top.classList.remove('hide'); }
    if(Math.abs(y-lastY)>8)lastY=y;
  },{passive:true});
  var io=new IntersectionObserver(function(es){
    es.forEach(function(en){
      if(!en.isIntersecting)return;
      var p=Number(en.target.dataset.p);
      if(bar)bar.style.width=((p+1)/total*100)+'%';
      if(cnt)cnt.textContent=(p+1)+'/'+total;
      write(ep,p);
    });
  },{threshold:0.4});
  document.querySelectorAll('.panel').forEach(function(el){io.observe(el)});
  var s=read();
  if(s&&s.ep===ep&&s.p>0){
    var t=document.querySelector('[data-p="'+s.p+'"]');
    if(t)requestAnimationFrame(function(){t.scrollIntoView()});
  }
}
var slot=document.getElementById('resume-slot');
if(slot){
  var s2=read();
  if(s2&&s2.ep){
    var a=document.createElement('a');
    a.className='resume';a.href='read/'+s2.ep+'.html';
    a.textContent='繼續閱讀 › 第 '+s2.ep+' 章・第 '+((s2.p||0)+1)+' 格';
    slot.appendChild(a);
  }
}
})();
`;
}

// ── 工具 ──

function numLabel(i, total) {
  return String(i + 1).padStart(String(total).length, '0');
}
function rel(path) {
  return path.includes('/') ? '../' : './';
}
function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── 全站樣式 ──

const SITE_CSS = `* { margin: 0; box-sizing: border-box; }
body { background: var(--bg); color: var(--ink); font-family: "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif; line-height: 1.7; }
a { color: var(--ink); }
h1, h2 { font-weight: 700; }
/* 首頁 */
.home { max-width: 640px; margin: 0 auto; padding: 4vh 1.2rem 2rem; }
.hero { text-align: center; padding-bottom: 2.2rem; }
.hero .cover { width: min(70%, 320px); border-radius: 10px; margin-bottom: 1.2rem; }
.hero h1 { font-size: 1.7rem; letter-spacing: .05em; }
.hook { color: var(--dim); margin: .8rem 0 1.2rem; }
.newest { color: var(--dim); font-size: .95rem; }
.resume { display: inline-block; margin-top: .9rem; padding: .55rem 1.1rem; border: 1px solid var(--line); border-radius: 999px; text-decoration: none; font-size: .95rem; }
.toc-sec h2, .chars h2 { font-size: 1.05rem; color: var(--dim); margin: 1.6rem 0 .6rem; }
.toc { list-style: none; border-top: 1px solid var(--line); padding: 0; }
.toc li { border-bottom: 1px solid var(--line); }
.toc a { display: flex; gap: 1rem; align-items: baseline; padding: .9rem .2rem; text-decoration: none; }
.toc .n { color: var(--dim); font-size: .78rem; letter-spacing: .2em; }
.toc .t { font-size: 1.05rem; }
.char-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: .9rem; }
.char-card { text-align: center; text-decoration: none; font-size: .9rem; color: var(--ink); }
.char-card img { width: 100%; aspect-ratio: 3/4; object-fit: cover; object-position: top; border-radius: 8px; margin-bottom: .35rem; }
/* 閱讀頁 */
.reader-top { position: fixed; top: 0; left: 0; right: 0; z-index: 10; display: flex; justify-content: space-between; align-items: center; gap: .8rem; padding: .55rem .9rem; background: color-mix(in srgb, var(--bg) 92%, transparent); backdrop-filter: blur(6px); border-bottom: 1px solid var(--line); transition: transform .25s; font-size: .92rem; }
.reader-top.hide { transform: translateY(-100%); }
.reader-top b { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.reader-top a { text-decoration: none; color: var(--dim); flex: none; }
.reader { max-width: 720px; margin: 0 auto; padding: 3rem 0 1rem; }
.panel { position: relative; margin: 0 0 6px; container-type: inline-size; background: var(--gap); }
.panel > img { display: block; width: 100%; height: auto; }
.fx { position: absolute; transform: translate(-50%, -50%); pointer-events: none; }
.bubble { position: absolute; transform: translate(-50%, -50%); width: max-content; background: #fff; color: #111; padding: .5em .8em; border-radius: 1em; font-family: "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif; font-size: clamp(13px, 3.4cqw, 22px); line-height: 1.6; letter-spacing: .02em; max-width: 46%; box-shadow: 0 1px 4px rgba(0,0,0,.35); }
.bubble.thought { background: none; box-shadow: none; border: none; color: #1c1a17; font-weight: 500; text-shadow: 0 0 6px #fff, 0 0 3px #fff, 0 0 1px #fff, 0 0 10px rgba(255,255,255,.8); }
.bubble.narration { background: rgba(16,16,20,.72); color: #f2f0ea; border-radius: 3px; border: none; padding: .55em .9em; font-weight: 400; }
.bubble.sfx { background: none; box-shadow: none; color: #111; font-weight: 900; font-size: clamp(22px, 7cqw, 44px); letter-spacing: .06em; transform: translate(-50%,-50%) rotate(-6deg); text-shadow: 1px 1px 0 #fff, -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff; }
.bubble .spk { display: block; font-size: .72em; color: #888; margin-bottom: .15em; }
.reader-nav { display: flex; justify-content: space-between; padding: 1.4rem .9rem 0; font-size: .98rem; }
.reader-nav a { text-decoration: none; }
.progress { position: fixed; left: 0; right: 0; bottom: 0; z-index: 10; height: 3px; background: var(--line); }
.progress i { display: block; height: 100%; width: 0; background: var(--acc); transition: width .2s; }
.progress span { position: absolute; right: .6rem; bottom: .5rem; font-size: .72rem; color: var(--dim); }
/* 角色頁 */
.char-page { max-width: 560px; margin: 0 auto; padding: 3.6rem 1.2rem 2rem; text-align: center; }
.char-page .portrait { width: min(70%, 300px); border-radius: 10px; margin-bottom: 1rem; }
.char-page h1 { font-size: 1.4rem; margin-bottom: .8rem; }
.card-text { text-align: left; color: var(--dim); font-size: .92rem; white-space: pre-wrap; }
/* footer */
.site-foot { text-align: center; color: var(--dim); font-size: .82rem; padding: 2.5rem 1rem 3.5rem; }
.site-foot a { color: var(--dim); }
.foot-links { margin: .4rem 0; }
`;
