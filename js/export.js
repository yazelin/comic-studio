// 純邏輯:把專案資料組成「出版級 PWA 漫畫站」的檔案清單。
// 多頁靜態站:首頁(hero/續讀/章節列表/角色區)+ read/N.html 每章一頁(SEO/上一章下一章/進度條)
// + char/<id>.html 角色頁 + manifest + SHELL/ASSET 兩層快取 SW(版本=內容雜湊,自動 bump)
// + sitemap/robots(有 site.url 才生)。
// 回傳 [{path, content}](文字檔);圖檔 blob 由呼叫端複製,但 ASSET 快取清單在這裡就要含
// 所有圖檔路徑,漏一張離線就破功。
//
// site 設定(project.json 的 site 欄,全部可選):
//   { url, description, author, links:{github,facebook,coffee,novel}, storageKey, theme, colors }

// 出版範本:一組名字帶一整套色票(站台底色+氣泡)。site.theme 選範本,site.colors 再逐項覆蓋。
// accent 在整個匯出站只用在一個地方:閱讀進度條。挑範本的 accent 時記得它代表「讀掉多少」。
// surface=比底色高一階的面(續讀鈕、章節列表與角色卡的 hover);accentSoft=副 accent(連結 hover)。
// 這兩個是深色範本的關鍵:只有 bg/line 的話,深色站的卡片跟底色黏成一片、滑過去也沒反應。
// 土金的 accentSoft 刻意用土褐不用金:金是保留色,只准出現在進度條那一處。
// 內心的白光暈與效果字的白描邊不進範本:它們是壓在畫格上的,要跟畫分離而不是跟站台底色搭。
// ponytail: 四個範本的 bubbleBg 都是白,所以工作台預覽沒接範本;哪天有範本要換泡色,
// 得把 --bub 那組變數接到 studio 的排版區,否則預覽會跟成品不同色。
export const THEMES = {
  // 暖紙:預設。米白紙感+墨字+低調金,通吃大部分作品
  paper: { bg: '#f4f1ea', ink: '#2a2622', dim: '#7a7266', line: 'rgba(0,0,0,.08)', accent: '#b98d2f', panelGap: '#e9e4d8',
    bubbleBg: '#fff', bubbleInk: '#111', narrationBg: 'rgba(16,16,20,.72)', narrationInk: '#f2f0ea' ,
    surface: '#ffffff', accentSoft: '#8a6a3c' },
  // 土金:給《token 無限》。全書低飽和土色調,金(#F6C945)是保留色=「被花掉的他」。
  // 站台唯一的金給進度條——讀掉多少=被花掉多少,剛好是這本書的主題,金不會散在別處亂叫。
  // 旁白條跟著換成深土褐,深黑條在土色書裡會跳出來。
  'token-unlimited': { bg: '#e8e0d2', ink: '#2b2620', dim: '#7d7263', line: 'rgba(0,0,0,.10)', accent: '#F6C945', panelGap: '#d9cfbd',
    bubbleBg: '#fff', bubbleInk: '#1c1813', narrationBg: 'rgba(43,38,32,.76)', narrationInk: '#efe8db' ,
    surface: '#efe9de', accentSoft: '#8a6a3c' },
  // 製版桌:comic-studio 站同款。墨黑底+暖紙白字+朱紅
  workbench: { bg: '#101013', ink: '#eceae4', dim: '#97959c', line: '#2b2b31', accent: '#d9482b', panelGap: '#17171b',
    bubbleBg: '#fff', bubbleInk: '#111', narrationBg: 'rgba(240,238,232,.9)', narrationInk: '#17171b' ,
    surface: '#17171b', accentSoft: '#e8624a' },
  // 深夜:neko-tensei 深藍夜色。surface/accentSoft 直接取自原站的 --panel/--pink,不是近似值
  midnight: { bg: '#12141d', ink: '#e8e6df', dim: '#a8a89f', line: 'rgba(232,194,106,.22)', accent: '#e8c26a', panelGap: '#1b1e2b',
    bubbleBg: '#fff', bubbleInk: '#12141d', narrationBg: 'rgba(18,20,29,.82)', narrationInk: '#e8e6df' ,
    surface: '#1b1e2b', accentSoft: '#f2a3b3' },
};

// 尾巴 'auto'(也是沒設定時的預設):指向格子中心。氣泡多半擺在角落、說話的人在畫面中央,
// 「往中心指」在絕大多數格子是對的;要更準就手動挑八向之一,或用 'none' 關掉。
// 泡本身就在中心時沒有方向可言,退回朝下。
const TAIL_BY_SECTOR = ['right', 'bottom-right', 'bottom', 'bottom-left', 'left', 'top-left', 'top', 'top-right'];
export function autoTail(x = 50, y = 50) {
  const dx = 50 - x, dy = 50 - y;              // 指向中心的向量(y 向下為正)
  if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return 'bottom';
  const sector = Math.round(Math.atan2(dy, dx) * 4 / Math.PI);   // 每 45 度一格
  return TAIL_BY_SECTOR[(sector + 8) % 8];
}
export function resolveTail(b) {
  return !b.tail || b.tail === 'auto' ? autoTail(b.x, b.y) : b.tail;
}

export function buildReaderFiles({ title, chapters, characters = [], site = {}, cover = null, assetsVersion = null, fontPath = 'fonts/comic-tc.woff2', ogPath = null }) {
  const KEY = 'comic-' + (site.storageKey || title);
  // 疊三層:暖紙打底(範本沒給的欄位有值可用)→ 選定範本 → site.colors 逐項覆蓋。名字打錯就退回暖紙。
  const C = { ...THEMES.paper, ...(THEMES[site.theme] || {}), ...(site.colors || {}) };
  const files = [];
  const imagePaths = chapters.flatMap(ch => ch.panels.flatMap(p => [p.image, ...(p.effects || []).map(f => f.image)]));
  for (const c of characters) {
    if (c.image) imagePaths.push(c.image);
    for (const s of c.sheets || []) imagePaths.push(s.image);
  }
  if (cover) imagePaths.push(cover);

  files.push({ path: 'style.css', content: `:root{--bg:${C.bg};--ink:${C.ink};--dim:${C.dim};--line:${C.line};--acc:${C.accent};--gap:${C.panelGap};--bub:${C.bubbleBg};--bub-ink:${C.bubbleInk};--narr:${C.narrationBg};--narr-ink:${C.narrationInk};--surf:${C.surface};--acc2:${C.accentSoft}}\n` + SITE_CSS });
  files.push({ path: 'app.js', content: appJs(KEY, chapters.map(c => c.title)) });
  // og:image 沒有專屬圖時退回 app icon。icon 是 512 方形,社群平台會裁掉或縮成小圖——
  // 要大圖卡就得給 1.91:1 的 og(呼叫端產,見 tools/make-og.mjs);有它才開 summary_large_image。
  site = { ...site, _bg: C.bg, _og: ogPath };
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
  // 字型進 SHELL:SW 用 addAll,少一個檔整包快取失敗——所以複製不成功時 bake 會傳 fontPath=null,
  // 頁面照樣能看(@font-face 找不到檔就退回系統字型堆疊),只是失去跨裝置一致。
  const shellPaths = ['./', ...files.map(f => './' + f.path), './icon-192.png', './icon-512.png',
    ...(fontPath ? ['./' + fontPath] : [])];
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
<meta property="og:image" content="${esc(base + '/' + (site._og || 'icon-512.png'))}">
${site._og ? `<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">` : ''}` : ''}
<link rel="manifest" href="${rel(path)}manifest.json">
<link rel="icon" href="${rel(path)}icon-192.png">
<meta name="theme-color" content="${site._bg}">
<link rel="stylesheet" href="${rel(path)}style.css">
${extra}
</head>
<body>`;
}

// 推廣三件套圖示(與 promo-footer 家族同一組路徑,三站視覺一致)
const ICON = {
  gh: 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12',
  fb: 'M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z',
  bmc: 'M20.216 6.415l-.132-.666c-.119-.598-.388-1.163-1.001-1.379-.197-.069-.42-.098-.57-.241-.152-.143-.196-.366-.231-.572-.065-.378-.125-.756-.192-1.133-.057-.325-.102-.69-.25-.987-.195-.4-.597-.634-.996-.788a5.723 5.723 0 00-.626-.194c-1-.263-2.05-.36-3.077-.416a25.834 25.834 0 00-3.7.062c-.915.083-1.88.184-2.75.5-.318.116-.646.256-.888.501-.297.302-.393.77-.177 1.146.154.267.415.456.692.58.36.162.737.284 1.123.366 1.075.238 2.189.331 3.287.37 1.218.05 2.437.01 3.65-.118.299-.033.598-.073.896-.119.352-.054.578-.513.474-.834-.124-.383-.457-.531-.834-.473-.466.074-.96.108-1.382.146-1.177.08-2.358.082-3.536.006a22.228 22.228 0 01-1.157-.107c-.086-.01-.18-.025-.258-.036-.243-.036-.484-.08-.724-.13-.111-.027-.111-.185 0-.212h.005c.277-.06.557-.108.838-.147h.002c.131-.009.263-.032.394-.048a25.076 25.076 0 013.426-.12c.674.019 1.347.067 2.017.144l.228.031c.267.04.533.088.798.145.392.085.895.113 1.07.542.055.137.08.288.111.431l.319 1.484a.237.237 0 01-.199.284h-.003c-.037.006-.075.01-.112.015a36.704 36.704 0 01-4.743.295 37.059 37.059 0 01-4.699-.304c-.14-.017-.293-.042-.417-.06-.326-.048-.649-.108-.973-.161-.393-.065-.768-.032-1.123.161-.29.16-.527.404-.675.701-.154.316-.199.66-.267 1-.069.34-.176.707-.135 1.056.087.753.613 1.365 1.37 1.502a39.69 39.69 0 0011.343.376.483.483 0 01.535.53l-.071.697-1.018 9.907c-.041.41-.047.832-.125 1.237-.122.637-.553 1.028-1.182 1.171-.577.131-1.165.2-1.756.205-.656.004-1.31-.025-1.966-.022-.699.004-1.556-.06-2.095-.58-.475-.458-.54-1.174-.605-1.793l-.731-7.013-.322-3.094c-.037-.351-.286-.695-.678-.678-.336.015-.718.3-.678.679l.228 2.185.949 9.112c.147 1.344 1.174 2.068 2.446 2.272.742.12 1.503.144 2.257.156.966.016 1.942.053 2.892-.122 1.408-.258 2.465-1.198 2.616-2.657.34-3.332.683-6.663 1.024-9.995l.215-2.087a.484.484 0 01.39-.426c.402-.078.787-.212 1.074-.518.455-.488.546-1.124.385-1.766zm-1.478.772c-.145.137-.363.201-.578.233-2.416.359-4.866.54-7.308.46-1.748-.06-3.477-.254-5.207-.498-.17-.024-.353-.055-.47-.18-.22-.236-.111-.71-.054-.995.052-.26.152-.609.463-.646.484-.057 1.046.148 1.526.22.577.088 1.156.159 1.737.212 2.48.226 5.002.19 7.472-.14.45-.06.899-.13 1.345-.21.399-.072.84-.206 1.08.206.166.281.188.657.162.974a.544.544 0 01-.169.364zm-6.159 3.9c-.862.37-1.84.788-3.109.788a5.884 5.884 0 01-1.569-.217l.877 9.004c.065.78.717 1.38 1.5 1.38 0 0 1.243.065 1.658.065.447 0 1.786-.065 1.786-.065.783 0 1.434-.6 1.499-1.38l.94-9.95a3.996 3.996 0 00-1.322-.238c-.826 0-1.491.284-2.26.613z',
  blog: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z',
};

function icon(href, key, label) {
  if (!href) return '';
  return `<a href="${esc(href)}" target="_blank" rel="noopener" aria-label="${esc(label)}" title="${esc(label)}">`
    + `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="${ICON[key]}"/></svg></a>`;
}

function footer(site, path) {
  const L = site.links || {};
  const novel = L.novel ? `<p class="foot-novel"><a href="${esc(L.novel)}">原作小說</a></p>` : '';
  const trio = [icon(L.github, 'gh', 'GitHub'), icon(L.facebook, 'fb', 'Facebook'), icon(L.coffee, 'bmc', '請我喝咖啡'), icon(L.blog, 'blog', '部落格')].filter(Boolean).join('');
  return `<footer class="site-foot">${novel}<div class="foot-icons">${trio}</div>
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
      return `<div class="bubble ${esc(b.type || 'speech')} t-${esc(resolveTail(b))}" style="left:${b.x}%;top:${b.y}%;${b.w ? `max-width:${b.w}%;` : ''}${fs}">${spk}${esc(b.text)}</div>`;
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
${(c.sheets || []).map(s => `<figure class="sheet"><img src="../${esc(s.image)}" alt="${esc(c.name)}${esc(s.label)}" loading="lazy"><figcaption>${esc(s.label)}</figcaption></figure>`).join('\n')}
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

function appJs(KEY, titles = []) {
  return `(function(){
'use strict';
var KEY=${JSON.stringify(KEY)};
// 話數≠小說章號(第 1 話可能叫「序章」),續讀連結一律用該話的真章名,沒有才退回話數
var TITLES=${JSON.stringify(titles)};
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
    a.textContent='繼續閱讀 › '+(TITLES[s2.ep-1]||('第 '+s2.ep+' 話'))+'・第 '+((s2.p||0)+1)+' 格';
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

// 字型自架:系統堆疊在 Android/Linux 常常掉到別的字型,同一本書換裝置就變樣;
// 氣泡位置與字級是排版時用眼睛喬的,字一換就跑掉。字型檔由 bake.js 複製進 dist/fonts/。
// font-display:block——晚一點顯示,好過先用系統字排好再換字跳動。
const SITE_CSS = `@font-face { font-family: 'Comic TC'; src: url('fonts/comic-tc.woff2') format('woff2'); font-weight: 100 900; font-display: block; }
* { margin: 0; box-sizing: border-box; }
body { background: var(--bg); color: var(--ink); font-family: 'Comic TC', "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif; line-height: 1.7; }
a { color: var(--ink); }
a:hover { color: var(--acc2); }
h1, h2 { font-weight: 700; }
/* 首頁 */
.home { max-width: 640px; margin: 0 auto; padding: 4vh 1.2rem 2rem; }
.hero { text-align: center; padding-bottom: 2.2rem; }
.hero .cover { width: min(70%, 320px); border-radius: 10px; margin-bottom: 1.2rem; }
.hero h1 { font-size: 1.7rem; letter-spacing: .05em; }
.hook { color: var(--dim); margin: .8rem 0 1.2rem; }
.newest { color: var(--dim); font-size: .95rem; }
.resume { display: inline-block; margin-top: .9rem; padding: .55rem 1.1rem; background: var(--surf); border: 1px solid var(--line); border-radius: 999px; text-decoration: none; font-size: .95rem; }
.toc-sec h2, .chars h2 { font-size: 1.05rem; color: var(--dim); margin: 1.6rem 0 .6rem; }
.toc { list-style: none; border-top: 1px solid var(--line); padding: 0; }
.toc li { border-bottom: 1px solid var(--line); }
.toc li:hover { background: var(--surf); }
.toc a { display: flex; gap: 1rem; align-items: baseline; padding: .9rem .2rem; text-decoration: none; }
.toc .n { color: var(--dim); font-size: .78rem; letter-spacing: .2em; }
.toc .t { font-size: 1.05rem; }
.char-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: .9rem; }
.char-card { text-align: center; text-decoration: none; font-size: .9rem; color: var(--ink); border-radius: 10px; padding: .35rem; }
.char-card:hover { background: var(--surf); color: var(--acc2); }
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
.bubble { position: absolute; transform: translate(-50%, -50%); width: max-content; background: var(--bub); color: var(--bub-ink); padding: .5em .8em; border-radius: 1em; font-family: 'Comic TC', "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif; font-size: clamp(13px, 3.4cqw, 22px); line-height: 1.6; letter-spacing: .02em; max-width: 46%; box-shadow: 0 1px 4px rgba(0,0,0,.35); }
/* 對白泡的尾巴——只有對白有;八方向 + t-none 不要。
   上下左右=border 三角形。斜角改用 clip-path 切直角三角形:轉開三角形會讓底邊離開泡緣、
   只剩一小截露在外面(看起來像貼邊的扁片),直角三角形的底邊天生貼平,尖角自然指向斜方。 */
.bubble.speech::after { content: ''; position: absolute; width: 0; height: 0; border: .5em solid transparent; }
.bubble.speech.t-none::after { content: none; }
.bubble.speech.t-bottom::after { top: 100%; left: 50%; margin: -1px 0 0 -.5em; border-bottom: 0; border-top-color: var(--bub); }
.bubble.speech.t-top::after { bottom: 100%; left: 50%; margin: 0 0 -1px -.5em; border-top: 0; border-bottom-color: var(--bub); }
.bubble.speech.t-left::after { right: 100%; top: 50%; margin: -.5em -1px 0 0; border-left: 0; border-right-color: var(--bub); }
.bubble.speech.t-right::after { left: 100%; top: 50%; margin: -.5em 0 0 -1px; border-right: 0; border-left-color: var(--bub); }
.bubble.speech.t-bottom-left::after,
.bubble.speech.t-bottom-right::after,
.bubble.speech.t-top-left::after,
.bubble.speech.t-top-right::after { border: 0; background: var(--bub); width: .95em; height: .95em; }
.bubble.speech.t-bottom-left::after { top: 100%; left: 20%; margin: -1px 0 0; clip-path: polygon(100% 0, 0 0, 0 100%); }
.bubble.speech.t-bottom-right::after { top: 100%; right: 20%; margin: -1px 0 0; clip-path: polygon(0 0, 100% 0, 100% 100%); }
.bubble.speech.t-top-left::after { bottom: 100%; left: 20%; margin: 0 0 -1px; clip-path: polygon(0 0, 100% 100%, 0 100%); }
.bubble.speech.t-top-right::after { bottom: 100%; right: 20%; margin: 0 0 -1px; clip-path: polygon(100% 0, 100% 100%, 0 100%); }
.bubble.thought { background: none; box-shadow: none; border: none; color: #1c1a17; font-weight: 500; text-shadow: 0 0 6px #fff, 0 0 3px #fff, 0 0 1px #fff, 0 0 10px rgba(255,255,255,.8); }
.bubble.narration { background: var(--narr); color: var(--narr-ink); border-radius: 3px; border: none; padding: .55em .9em; font-weight: 400; }
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
.char-page .sheet { margin: 1.8rem 0 0; }
.char-page .sheet img { width: 100%; border-radius: 10px; display: block; }
.char-page .sheet figcaption { color: var(--dim); font-size: .82rem; margin-top: .4rem; }
/* footer */
.site-foot { text-align: center; color: var(--dim); font-size: .82rem; padding: 2.8rem 1rem 3.5rem; border-top: 1px solid var(--line); margin-top: 2.5rem; }
.site-foot a { color: color-mix(in srgb, var(--ink) 72%, transparent); }
.foot-novel { margin-bottom: .9rem; font-size: .92rem; }
.foot-novel a { text-decoration: none; border-bottom: 1px solid var(--line); padding-bottom: .15rem; }
.foot-icons { display: flex; justify-content: center; gap: 1.15rem; margin: 0 0 .9rem; }
.foot-icons a { display: inline-flex; opacity: .78; transition: opacity .2s; }
.foot-icons a:hover { opacity: 1; }
`;
