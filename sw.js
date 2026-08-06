// comic-studio 工作台的離線殼。
//
// 這是「工具」不是「內容站」:生圖一定要連線,所以 SW 只做兩件事——
//   1. 殼可離線:斷線時 UI 還開得起來、專案資料夾(File System Access)照樣讀得到
//   2. 可安裝:桌面一顆 icon 直接開工作台
// **絕不快取任何 API 回應**(生圖端點、模型清單):快取一張圖幾 MB,而且會讓人以為離線能生圖。
// 前綴 cstudio- 不是 cs-:token-unlimited-comic 用的就是 cs-,而 yazelin.github.io
// 所有專案共用同一個 origin、共用同一份 CacheStorage(scope 只管 fetch,管不到快取)。
const SHELL = 'cstudio-shell-v4';
const SHELL_FILES = [
  './', './index.html', './studio.html',
  './css/studio.css',
  './js/app.js', './js/ui.js', './js/store.js', './js/data.js', './js/prompt.js',
  './js/providers.js', './js/providers-core.js', './js/storyboard.js', './js/characters.js',
  './js/world.js',
  './js/generate.js', './js/layout.js', './js/bake.js', './js/export.js', './js/merge.js', './js/import.js', './js/lint-layout.js',
  './manifest.json', './assets/icon-192.png', './assets/icon-512.png', './assets/favicon-32.png',
  './assets/fonts/comic-tc.woff2',   // 排版預覽要跟匯出同字型,離線也得有
];

self.addEventListener('install', e => {
  // 個別 add:少一個檔就整包 addAll 失敗,離線殼直接不存在——寧可缺一張圖也要裝起來
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    await Promise.all(SHELL_FILES.map(f => c.add(f).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    // 只清自己的 cstudio-*:CacheStorage 是 per-origin,無差別刪會把同 origin 其他
    // 專案(gewu 33MB、neko、token-unlimited…)的離線包整包清掉,而且完全沒有徵兆。
    // 'cs-shell-v3' 是本站改名前的舊快取,一次性收掉(那是自己的,不是 tuc 的 cs-shell-lnzmxo-*)
    .then(keys => Promise.all(keys.filter(k => (k.startsWith('cstudio-') || k === 'cs-shell-v3') && k !== SHELL).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                     // 生圖是 POST,直接放行
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;           // 外部端點(生圖 API)永遠不碰
  // 殼走 network-first:有網路就拿最新版(工具會頻繁更新),離線才回退快取
  e.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      const c = await caches.open(SHELL);
      c.put(req, fresh.clone()).catch(() => {});
      return fresh;
    } catch {
      const hit = await caches.match(req, { ignoreSearch: true });
      return hit || caches.match('./studio.html');
    }
  })());
});
