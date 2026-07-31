// node tests/selfcheck.mjs — 純邏輯自我檢查,全綠才算過
import assert from 'node:assert/strict';
import { buildStoryboardPrompt, parseStoryboard, buildPanelPrompt, buildBakePrompt, buildEffectPrompt } from '../js/prompt.js';
import { buildReaderFiles } from '../js/export.js';
import { buildCodexRequest, buildGeminiWebRequest, buildOpenAIImageRequest, buildChatRequest } from '../js/providers-core.js';

// ── parseStoryboard ──
const clean = JSON.stringify({ panels: [{ scene: '森林', characters: ['亞澤'], shot: '遠景', dialogue: [{ speaker: '亞澤', text: '哈囉', type: 'speech' }] }] });
let sb = parseStoryboard(clean);
assert.equal(sb.panels.length, 1);
assert.equal(sb.panels[0].order, 1);
assert.ok(sb.panels[0].id);
assert.equal(sb.panels[0].dialogue[0].type, 'speech');

sb = parseStoryboard('好的,以下是分鏡:\n```json\n' + clean + '\n```\n以上。');
assert.equal(sb.panels.length, 1, 'code fence 包裹要能解');

sb = parseStoryboard('{"panels":[{"scene":"鎮上"}]}');
assert.equal(sb.panels[0].dialogue.length, 0, '缺欄位要補預設值');
assert.equal(sb.panels[0].characters.length, 0);

assert.throws(() => parseStoryboard('這不是 JSON'), /JSON/, '垃圾輸入要丟錯');
assert.throws(() => parseStoryboard('{"foo":1}'), /panels/, '缺 panels 要丟錯');

// ── buildStoryboardPrompt ──
const chars = [{ id: 'yaze', name: '亞澤', card: '黑髮工程師,深色外套' }];
const sp = buildStoryboardPrompt('他走進森林,火球在手中成形。', chars);
assert.ok(sp.includes('他走進森林'), '要含章節原文');
assert.ok(sp.includes('panels'), '要含 schema 說明');
assert.ok(sp.includes('亞澤'), '要含角色名單');
assert.ok(sp.includes('JSON'), '要求 JSON 輸出');

// ── buildPanelPrompt ──
const pp = buildPanelPrompt({
  style: '黑白日式漫畫,網點,高對比',
  panel: { scene: '燒焦的林地,晨霧', shot: '低角度仰視', characters: ['yaze'], notes: '' },
  characterCards: chars,
});
assert.ok(pp.includes('黑白日式漫畫'), '要含全域畫風');
assert.ok(pp.includes('燒焦的林地'), '要含場景');
assert.ok(pp.includes('黑髮工程師'), '要含角色設定卡');
assert.ok(/不要.*文字|禁止.*文字/.test(pp), '要禁止 AI 畫字(氣泡用疊字)');

// ── buildReaderFiles ──
const files = buildReaderFiles({
  title: '測試漫畫',
  chapters: [
    { title: '第一章', panels: [
      { image: 'imgs/c1-p1.png', bubbles: [{ x: 10, y: 10, w: 30, type: 'speech', speaker: '亞澤', text: '哈囉' }] },
      { image: 'imgs/c1-p2.png', bubbles: [] },
    ] },
  ],
});
const paths = files.map(f => f.path);
for (const p of ['index.html', 'manifest.json', 'sw.js', 'style.css', 'app.js', 'read/1.html']) {
  assert.ok(paths.includes(p), `匯出要含 ${p}`);
}
const sw = files.find(f => f.path === 'sw.js').content;
const shellList = JSON.parse(sw.match(/const SHELL_FILES = (\[[^\]]*\])/s)[1]);
const assetList = JSON.parse(sw.match(/const ASSET_FILES = (\[[^\]]*\])/s)[1]);
assert.ok(shellList.includes('./read/1.html') && shellList.includes('./style.css'), 'SHELL 快取要含頁面殼');
assert.deepEqual(new Set(assetList), new Set(['./imgs/c1-p1.png', './imgs/c1-p2.png']), 'ASSET 快取=全部圖');
assert.ok(sw.includes('ignoreSearch'), 'SW 要 ignoreSearch');
const idx = files.find(f => f.path === 'index.html').content;
assert.ok(idx.includes('serviceWorker.register'), 'index 要註冊 SW');
assert.ok(idx.includes('測試漫畫'));
const manifest = JSON.parse(files.find(f => f.path === 'manifest.json').content);
assert.equal(manifest.name, '測試漫畫');
const rd = files.find(f => f.path === 'read/1.html').content;
assert.ok(rd.includes('哈囉') && rd.includes('class="bubble speech t-'), '章頁要內嵌氣泡');

// ── provider request builders(不打網路,只驗組裝)──
const codex = buildCodexRequest({ baseurl: 'http://h:8000/', apiKey: 'K', prompt: 'p', refImagesB64: ['AAA'], count: 2, size: '1024x1536' });
assert.equal(codex.url, 'http://h:8000/v1/images/jobs');
assert.equal(codex.headers.Authorization, 'Bearer K');
assert.deepEqual(JSON.parse(codex.body).reference_images_base64, ['AAA']);
assert.equal(JSON.parse(codex.body).count, 2);

const gemNoRef = buildGeminiWebRequest({ baseurl: 'http://h:8070', apiKey: 'K', prompt: 'p', refImagesB64: [] });
assert.equal(gemNoRef.url, 'http://h:8070/api/generate');
assert.equal(gemNoRef.headers['x-goog-api-key'], 'K');
const gemRef = buildGeminiWebRequest({ baseurl: 'http://h:8070', apiKey: 'K', prompt: 'p', refImagesB64: ['BBB'] });
assert.equal(gemRef.url, 'http://h:8070/api/edit');
assert.equal(JSON.parse(gemRef.body).reference_image, 'BBB');

const oai = buildOpenAIImageRequest({ baseurl: 'https://api.openai.com', apiKey: 'K', prompt: 'p', model: 'gpt-image-1', count: 1 });
assert.equal(oai.url, 'https://api.openai.com/v1/images/generations');
assert.equal(JSON.parse(oai.body).model, 'gpt-image-1');

const chatG = buildChatRequest({ type: 'gemini-web', baseurl: 'http://h:8070', apiKey: 'K', prompt: 'hi' });
assert.equal(chatG.url, 'http://h:8070/api/chat');
const chatO = buildChatRequest({ type: 'openai-compatible', baseurl: 'https://x/v1', apiKey: 'K', model: 'gpt-4o', prompt: 'hi' });
assert.equal(chatO.url, 'https://x/v1/chat/completions');
assert.equal(JSON.parse(chatO.body).messages[0].content, 'hi');

// ── applyProjectKeys(keys.json 帶入,只進記憶體)──
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const { applyProjectKeys, loadProviders } = await import('../js/providers.js');
const n = applyProjectKeys({ 'gemini-web': 'K1', '不存在的': 'K2', 'codex-image-service': '' });
assert.equal(n, 1, '只套用名稱吻合且非空的 key');
assert.equal(loadProviders().find(p => p.name === 'gemini-web').apiKey, 'K1');
assert.equal(applyProjectKeys(null), 0, 'keys.json 不存在要安靜略過');

// ── extractChapterFromHTML(從閱讀頁抽正文)──
const { extractChapterFromHTML } = await import('../js/import.js');
const html = `<html><head><title>第一章：測試 &amp; 火球</title><style>p{color:red}</style></head>
<body><p>頁面選單不該被抓</p><main><script>var x=1;</script>
<p>森林比他想的深。</p><p><em>強調</em>也要保留文字</p><p>  </p><p>&#x300C;引號&#x300D;&amp;符號</p></main></body></html>`;
const ch = extractChapterFromHTML(html);
assert.equal(ch.title, '第一章：測試 & 火球');
assert.equal(ch.text.split('\n\n').length, 3, '空段落要略過、main 外的 p 不抓');
assert.ok(ch.text.startsWith('森林比他想的深。'));
assert.ok(ch.text.includes('強調也要保留文字'));
assert.ok(ch.text.includes('「引號」&符號'), '實體要解碼');
assert.throws(() => extractChapterFromHTML('<html><body><div>沒有段落</div></body></html>'), /段落/);

// ── buildCharacterSheetPrompt(多視角設定圖)──
const { buildCharacterSheetPrompt, buildExpressionSheetPrompt, buildPoseSheetPrompt } = await import('../js/prompt.js');
const csp = buildCharacterSheetPrompt({ style: '黑白漫畫', name: '亞澤', card: '黑髮工程師' });
assert.ok(csp.includes('三視角') && csp.includes('表情差分'), '要含多視角與表情要求');
assert.ok(csp.includes('黑髮工程師') && csp.includes('黑白漫畫'));
assert.ok(/不要出現任何文字/.test(csp));

// ── applyCharacterMerge(角色去重合併)──
const { applyCharacterMerge } = await import('../js/merge.js');
const msb = { panels: [
  { characters: ['yaze', '男子'] },
  { characters: ['男子', '神官'] },
  { characters: ['神官'] },
] };
const touched = applyCharacterMerge(msb, ['男子'], 'yaze');
assert.equal(touched, 2, '有引用 from 的格才算 touched');
assert.deepEqual(msb.panels[0].characters, ['yaze'], '合併後要去重');
assert.deepEqual(msb.panels[1].characters, ['yaze', '神官']);
assert.deepEqual(msb.panels[2].characters, ['神官'], '無關格不動');

console.log('selfcheck: 全部通過');

// ── buildBakePrompt(匯出重繪) ──
const bp = buildBakePrompt([
  { x: 10, y: 80, type: 'thought', text: '我好像自由了。' },
  { x: 70, y: 10, type: 'narration', text: '然後是安靜。' },
  { x: 10, y: 12, type: 'speech', text: '⋯⋯好喔。' },
]);
assert.ok(bp.includes('image-edit'), '要是 image-edit 指令');
assert.ok(bp.includes('3 pieces of text'), '要含正確段數');
assert.ok(bp.indexOf('然後是安靜。') < bp.indexOf('⋯⋯好喔。'), 'y 小的先(10<12)');
assert.ok(bp.indexOf('⋯⋯好喔。') < bp.indexOf('我好像自由了。'), '由上而下');
assert.ok(bp.includes('speech bubble'), '對白=白泡');
assert.ok(bp.includes('NO bubble'), '內心=無框浮字');
assert.ok(bp.includes('narration caption box'), '旁白=深底條');
assert.ok(bp.includes('bottom-left') && bp.includes('top-right') && bp.includes('top-left'), '方位對映');
console.log('buildBakePrompt ok');

// ── sfx+字體錨 ──
const bs = buildBakePrompt([
  { x: 50, y: 50, type: 'sfx', text: '轟' },
  { x: 10, y: 10, type: 'narration', text: '然後是安靜。' },
], { fontRef: true });
assert.ok(bs.includes('sound-effect lettering'), 'sfx=效果字指令');
assert.ok(bs.includes('Image 2'), 'fontRef 要提到樣本圖');
assert.ok(bs.includes('matched exactly'), '基準字體要鎖樣本');
assert.ok(bs.includes('exempt'), '效果字不吃基準');
const sbx = parseStoryboard(JSON.stringify({ panels: [{ scene: 'x', dialogue: [{ speaker: '', text: '轟', type: 'sfx' }] }] }));
assert.equal(sbx.panels[0].dialogue[0].type, 'sfx', '分鏡解析要收 sfx');
console.log('sfx+fontRef ok');

// ── buildEffectPrompt(效果圖層) ──
const ep1 = buildEffectPrompt({ desc: '巨大的手繪擬聲字「轟」,碎裂筆勢', mode: 'ink', style: '溫暖動畫風' });
assert.ok(ep1.includes('PURE SOLID WHITE'), '墨模式=純白底');
assert.ok(ep1.includes('multiply'), '墨模式提示 multiply');
assert.ok(ep1.includes('轟'), '要含描述');
assert.ok(ep1.includes('溫暖動畫風'), '要含全域畫風');
const ep2 = buildEffectPrompt({ desc: '一團金色光暈', mode: 'light' });
assert.ok(ep2.includes('PURE SOLID BLACK') && ep2.includes('screen'), '光模式=純黑底+screen');

// ── 匯出含效果層 ──
const filesFx = buildReaderFiles({ title: 'T', chapters: [{ title: 'C1', panels: [
  { image: 'imgs/a.png', bubbles: [{ x: 1, y: 1, text: 'x', type: 'speech', fs: 5 }], effects: [{ image: 'imgs/a-fx1.png', x: 50, y: 50, w: 60, rot: 0, op: 100, blend: 'multiply' }] },
] }], characters: [{ id: 'yaze', name: '亞澤', card: '卡', image: 'imgs/char-yaze.png' }],
  site: { url: 'https://ex.com/comic', description: '簡介', author: '林亞澤', links: { github: 'https://g', novel: 'https://n' } }, cover: 'imgs/cover.png' });
const fxPaths = filesFx.map(f => f.path);
for (const need of ['index.html', 'read/1.html', 'char/yaze.html', 'style.css', 'app.js', 'manifest.json', 'sw.js', 'sitemap.xml', 'robots.txt'])
  assert.ok(fxPaths.includes(need), '要有 ' + need);
const readPage = filesFx.find(f => f.path === 'read/1.html').content;
assert.ok(readPage.includes('mix-blend-mode'), '閱讀頁要渲染效果層');
assert.ok(readPage.includes('font-size:5cqw'), '手動字級要進頁面');
assert.ok(readPage.includes('canonical'), '每章頁要有 canonical');
const swFx = filesFx.find(f => f.path === 'sw.js').content;
assert.ok(swFx.includes('./imgs/a-fx1.png') && swFx.includes('./imgs/char-yaze.png') && swFx.includes('./imgs/cover.png'), '效果層/角色圖/封面要進 ASSET 快取');
assert.ok(swFx.includes('cs-shell-') && swFx.includes('cs-asset-'), '兩層快取,版本=雜湊');
const homePage = filesFx.find(f => f.path === 'index.html').content;
assert.ok(homePage.includes('char/yaze.html') && idx.includes('read/2.html') === false, '首頁列章節與角色');
assert.ok(homePage.includes('resume-slot'), '首頁有續讀槽');
assert.ok(homePage.includes('原作小說') && homePage.includes('aria-label="GitHub"') && homePage.includes('<svg'), 'footer=原作小說+SVG 圖示三件套');
// 無 site 設定也要能匯出(不生 sitemap/robots)
const bare = buildReaderFiles({ title: 'T', chapters: [{ title: 'C', panels: [{ image: 'imgs/a.png', bubbles: [] }] }] });
assert.ok(!bare.map(f => f.path).includes('sitemap.xml'), '無 url 不生 sitemap');
console.log('publish-grade export ok');

// ── 手動字級 ──
console.log('manual font size ok(併入 publish-grade 測試)');

// ── 分鏡要求微表情 ──
assert.ok(buildStoryboardPrompt('x', []).includes('表情:'), '分鏡指令要求微表情欄');
console.log('expression rule ok');

// ── 角色頁 bio 優先 ──
const bioFiles = buildReaderFiles({ title: 'T', chapters: [{ title: 'C', panels: [{ image: 'imgs/a.png', bubbles: [] }] }],
  characters: [{ id: 'x', name: 'X', card: 'EN PROMPT', bio: '中文介紹' }] });
const cp = bioFiles.find(f => f.path === 'char/x.html').content;
assert.ok(cp.includes('中文介紹') && !cp.includes('EN PROMPT'), '角色頁 bio 優先於生圖卡');
console.log('char bio ok');

// ── 配色:預設暖紙+可覆寫 ──
const warm = buildReaderFiles({ title: 'T', chapters: [{ title: 'C', panels: [{ image: 'imgs/a.png', bubbles: [] }] }] });
assert.ok(warm.find(f => f.path === 'style.css').content.includes('--bg:#f4f1ea'), '預設暖紙底');
assert.ok(JSON.parse(warm.find(f => f.path === 'manifest.json').content).theme_color === '#f4f1ea', 'manifest 同步色票');
const dark = buildReaderFiles({ title: 'T', chapters: [{ title: 'C', panels: [{ image: 'imgs/a.png', bubbles: [] }] }], site: { colors: { bg: '#111114' } } });
assert.ok(dark.find(f => f.path === 'style.css').content.includes('--bg:#111114'), 'site.colors 可覆寫');
console.log('palette ok');

// ── ASSET 版本可由內容決定 ──
const av = buildReaderFiles({ title: 'T', chapters: [{ title: 'C', panels: [{ image: 'imgs/a.png', bubbles: [] }] }], assetsVersion: 'v-123' });
assert.ok(av.find(f => f.path === 'sw.js').content.includes("cs-asset-v-123"), 'assetsVersion 要進 SW');
console.log('asset version ok');

// ── 三件套只渲染有給的連結 ──
const noLinks = buildReaderFiles({ title: 'T', chapters: [{ title: 'C', panels: [{ image: 'i.png', bubbles: [] }] }], site: { links: { github: 'https://g' } } });
const nl = noLinks.find(f => f.path === 'index.html').content;
assert.ok(nl.includes('aria-label="GitHub"') && !nl.includes('請我喝咖啡'), '沒給的連結不渲染');
console.log('footer trio ok');

// ── 角色設定表:表情集/動作集/must_not ──
const ep = buildExpressionSheetPrompt({ style: '暖色動畫風', name: '陸修', card: 'young man' });
assert.ok(ep.includes('3x3') && ep.includes('沉思') && ep.includes('same face'), '表情集=九宮格同一張臉');
assert.ok(ep.includes('no exaggerated'), '表情要克制,不誇張');
const pp2 = buildPoseSheetPrompt({ style: '暖色動畫風', name: '陸修', card: 'young man' });
assert.ok(pp2.includes('3x3') && pp2.includes('full-body') && pp2.includes('跌坐在地'), '動作集=九宮格全身');
const withNot = buildPanelPrompt({ style: 's', panel: { scene: 'x', shot: '中景', characters: ['a'], notes: '' },
  characterCards: [{ id: 'a', name: 'A', card: 'card', must_not: '帽子' }] });
assert.ok(withNot.includes('絕對不可出現: 帽子'), 'must_not 要進格 prompt');
console.log('character sheets ok');

// ── 工作台自己的 PWA 完整度(對齊家族其他站) ──
{
  const fs = await import('node:fs');
  const mf = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  assert.ok(mf.name && mf.start_url && mf.display === 'standalone', 'manifest 必要欄位');
  assert.ok(mf.icons.some(i => i.sizes === '512x512' && i.purpose === 'maskable'), '要有 maskable 512 圖示');
  for (const i of mf.icons) assert.ok(fs.existsSync(i.src.replace('./', '')), '圖示檔要存在:' + i.src);
  const sw = fs.readFileSync('sw.js', 'utf8');
  assert.ok(sw.includes("req.method !== 'GET'") && sw.includes('url.origin !== location.origin'),
    'SW 不准碰生圖 API(POST 與跨網域一律放行)');
  const shell = [...sw.match(/const SHELL_FILES = \[([^\]]*)\]/s)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  for (const f of shell) {
    if (f === './') continue;
    assert.ok(fs.existsSync(f.replace('./', '')), 'SHELL 清單裡的檔要存在:' + f);
  }
  for (const js of fs.readdirSync('js')) {
    assert.ok(shell.includes('./js/' + js), 'js 少進 SHELL 快取:' + js);
  }
  for (const page of ['index.html', 'studio.html']) {
    const h = fs.readFileSync(page, 'utf8');
    assert.ok(h.includes('rel="manifest"') && h.includes('serviceWorker'), page + ' 要接 manifest 與 SW');
  }
  console.log('studio PWA ok');
}

// ── 自架字型:CSS 宣告、進 SHELL 快取、抓不到時要能退場 ──
const withFont = buildReaderFiles({ title: 'T', chapters: [{ title: 'C', panels: [{ image: 'i.png', bubbles: [] }] }] });
const fcss = withFont.find(f => f.path === 'style.css').content;
assert.ok(fcss.includes("@font-face") && fcss.includes("fonts/comic-tc.woff2"), '匯出 CSS 要宣告自架字型');
assert.ok(fcss.includes("font-family: 'Comic TC'"), '內文要真的用到自架字型');
assert.ok(withFont.find(f => f.path === 'sw.js').content.includes('./fonts/comic-tc.woff2'), '字型要進 SHELL 快取,否則離線變系統字');
const noFont = buildReaderFiles({ title: 'T', chapters: [{ title: 'C', panels: [{ image: 'i.png', bubbles: [] }] }], fontPath: null });
assert.ok(!noFont.find(f => f.path === 'sw.js').content.includes('comic-tc.woff2'),
  '複製不到字型時不可列進 SHELL——SW 用 addAll,少一個檔整包快取會失敗');
console.log('self-hosted font ok');

// ── 氣泡尾巴 ──
const TAIL_DIRS = ['bottom', 'bottom-left', 'bottom-right', 'top', 'top-left', 'top-right', 'left', 'right'];
const tails = buildReaderFiles({ title: 'T', chapters: [{ title: 'C', panels: [{ image: 'i.png', bubbles: [
  { type: 'speech', text: '預設', x: 30, y: 30 },
  ...TAIL_DIRS.map((d, i) => ({ type: 'speech', text: d, x: 10 + i * 9, y: 50, tail: d })),
  { type: 'speech', text: '不要', x: 80, y: 20, tail: 'none' },
  { type: 'thought', text: '內心', x: 10, y: 10 },
] }] }] });
const tr = tails.find(f => f.path === 'read/1.html').content;
assert.ok(tr.includes('class="bubble speech t-bottom"'), '對白泡預設朝下的尾巴');
assert.ok(tr.includes('class="bubble speech t-none"'), '可以關掉尾巴');
const tcss = tails.find(f => f.path === 'style.css').content;
for (const d of TAIL_DIRS) {
  assert.ok(tr.includes(`class="bubble speech t-${d}"`), '每顆泡自己的方向要寫進 class:' + d);
  assert.ok(tcss.includes(`.bubble.speech.t-${d}::after`), '尾巴 CSS 少了方向:' + d);
}
for (const d of ['bottom-left', 'bottom-right', 'top-left', 'top-right']) {
  const rule = tcss.slice(tcss.lastIndexOf(`.bubble.speech.t-${d}::after`)).split('}')[0];
  assert.ok(rule.includes('clip-path: polygon('), '斜角尾巴要用直角三角形切,不是轉開的等腰三角形:' + d);
  assert.ok(/(top|bottom): 100%/.test(rule) && /(left|right): 20%/.test(rule), '斜角尾巴底邊要貼在泡緣:' + d);
}
assert.ok(tcss.includes('.bubble.speech.t-none::after { content: none;'), 't-none 要真的關掉');
assert.ok(!tcss.includes('.bubble.thought.t-'), '只有對白泡有尾巴');
console.log('bubble tails ok');

// ── 工作台預覽與匯出必須同款(排版靠眼睛喬,兩邊不一樣就白排) ──
{
  const fs = await import('node:fs');
  const studioCss = fs.readFileSync('css/studio.css', 'utf8');
  assert.ok(studioCss.includes("font-family: 'Comic TC'") && studioCss.includes('comic-tc.woff2'),
    '工作台要載同一支字型,否則預覽字級跟成品對不起來');
  for (const d of [...TAIL_DIRS, 'none']) {
    assert.ok(studioCss.includes(`.bubble.speech.t-${d}::after`), '工作台缺尾巴樣式:' + d);
  }
  const opts = fs.readFileSync('js/layout.js', 'utf8');
  for (const d of [...TAIL_DIRS, 'none']) {
    assert.ok(opts.includes(`value: '${d}'`), '氣泡編輯視窗選不到方向:' + d);
  }
  assert.ok(fs.readFileSync('sw.js', 'utf8').includes('./assets/fonts/comic-tc.woff2'), '字型要進工作台離線殼');
  assert.ok(fs.existsSync('assets/fonts/comic-tc.woff2'), '字型檔要在 repo 裡');
  assert.ok(fs.existsSync('assets/fonts/OFL.txt'), 'OFL 授權要隨字型附上');
}
console.log('studio/export parity ok');

// ── 出版範本(site.theme) ──
{
  const { THEMES } = await import('../js/export.js');
  const mk = site => buildReaderFiles({ title: 'T', chapters: [{ title: 'C', panels: [{ image: 'i.png', bubbles: [] }] }], site });
  const css = s => mk(s).find(f => f.path === 'style.css').content;

  for (const k of ['paper', 'token-unlimited', 'workbench', 'midnight']) {
    assert.ok(THEMES[k], '少了範本:' + k);
    for (const field of ['bg', 'ink', 'dim', 'line', 'accent', 'panelGap', 'bubbleBg', 'bubbleInk', 'narrationBg', 'narrationInk']) {
      assert.ok(THEMES[k][field], `範本 ${k} 缺欄位 ${field}——缺一項就會被暖紙的值補上,悄悄長錯色`);
    }
  }
  assert.ok(css({}).includes('--bg:#f4f1ea'), '不給範本=暖紙');
  assert.ok(css({ theme: 'token-unlimited' }).includes('--acc:#F6C945'),
    '土金範本的 accent 是 canon 定死的金 #F6C945(進度條=被花掉多少)');
  assert.ok(css({ theme: 'token-unlimited' }).includes('--bg:#e8e0d2'), '土金範本要換站台底色');
  assert.ok(css({ theme: 'midnight' }).includes('--bg:#12141d'), '深夜範本要換站台底色');
  assert.ok(css({ theme: '打錯的名字' }).includes('--bg:#f4f1ea'), '範本名打錯要退回暖紙,不是壞掉');
  assert.ok(css({ theme: 'midnight', colors: { bg: '#000' } }).includes('--bg:#000'), 'site.colors 蓋得過範本');
  assert.ok(css({ theme: 'midnight', colors: { bg: '#000' } }).includes('--acc:#e8c26a'), '只蓋指定的那一項,其餘留範本的');
  const mfst = JSON.parse(mk({ theme: 'workbench' }).find(f => f.path === 'manifest.json').content);
  assert.equal(mfst.theme_color, '#101013', 'manifest 色票要跟著範本走');

  // 氣泡與尾巴要吃範本變數,不能硬寫白——換深色範本時尾巴會跟泡不同色
  const bodyCss = css({}).split('\n').slice(1).join('\n');
  const bubbleRules = bodyCss.split('\n').filter(l => l.includes('.bubble') && !l.includes('.thought') && !l.includes('.sfx'));
  assert.ok(bubbleRules.length >= 9, '氣泡規則應該有一批');
  for (const rule of bubbleRules) {
    assert.ok(!/#fff\b|#ffffff\b/i.test(rule), '氣泡/尾巴不可硬寫白,要走 var(--bub):' + rule.trim().slice(0, 60));
  }
  assert.ok(bodyCss.includes('background: var(--bub)') && bodyCss.includes('color: var(--bub-ink)'), '對白泡吃範本色');
  assert.ok(bodyCss.includes('background: var(--narr)'), '旁白條吃範本色');
  console.log('themes ok');
}

// ── 範本要能在 UI 選,且不可蓋掉 site 的其他欄 ──
{
  const fs = await import('node:fs');
  assert.ok(fs.readFileSync('studio.html', 'utf8').includes('id="p-theme"'), '專案設定要有範本下拉');
  const appjs = fs.readFileSync('js/app.js', 'utf8');
  assert.ok(/app\.meta\.site = \{ \.\.\.\(app\.meta\.site \|\| \{\}\), theme:/.test(appjs),
    '存範本要用展開合併,直接指派會把 site.url/links/colors 清掉');
  console.log('theme picker ok');
}
