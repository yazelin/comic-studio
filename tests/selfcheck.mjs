// node tests/selfcheck.mjs — 純邏輯自我檢查,全綠才算過
import assert from 'node:assert/strict';
import { buildStoryboardPrompt, parseStoryboard, buildPanelPrompt, buildBakePrompt } from '../js/prompt.js';
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
for (const p of ['index.html', 'manifest.json', 'sw.js', 'reader.css', 'reader.js', 'data.json']) {
  assert.ok(paths.includes(p), `匯出要含 ${p}`);
}
const sw = files.find(f => f.path === 'sw.js').content;
const precache = JSON.parse(sw.match(/const PRECACHE = (\[[^\]]*\])/s)[1]);
const expected = new Set([...paths.map(p => './' + p), './', './imgs/c1-p1.png', './imgs/c1-p2.png', './icon-192.png', './icon-512.png']);
assert.deepEqual(new Set(precache), expected, 'precache 清單必須=全部檔案+圖+icons');
assert.ok(sw.includes('ignoreSearch'), 'SW 要 ignoreSearch');
const idx = files.find(f => f.path === 'index.html').content;
assert.ok(idx.includes('serviceWorker.register'), 'index 要註冊 SW');
assert.ok(idx.includes('測試漫畫'));
const manifest = JSON.parse(files.find(f => f.path === 'manifest.json').content);
assert.equal(manifest.name, '測試漫畫');
const data = JSON.parse(files.find(f => f.path === 'data.json').content);
assert.equal(data.chapters[0].panels[0].bubbles[0].text, '哈囉');

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
const { buildCharacterSheetPrompt } = await import('../js/prompt.js');
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
