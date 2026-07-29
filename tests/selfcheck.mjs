// node tests/selfcheck.mjs — 純邏輯自我檢查,全綠才算過
import assert from 'node:assert/strict';
import { buildStoryboardPrompt, parseStoryboard, buildPanelPrompt } from '../js/prompt.js';
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

console.log('selfcheck: 全部通過');
