// 生圖站:逐格/整章批量、多候選、燈箱選定
import { $, h, toast, setStatus, lightbox, progressBar, emptyState } from './ui.js';
import * as store from './store.js';
import * as data from './data.js';
import { getProvider, generateImages } from './providers.js';
import { buildPanelPrompt } from './prompt.js';
import { app, requireProject } from './app.js';

let stopBatch = false;

export async function refreshGenerate() {
  const box = $('#gen-panels');
  if (!requireProject(box)) { $('#gen-toolbar').hidden = true; return; }
  $('#gen-toolbar').hidden = false;
  await render();
}

async function render() {
  const box = $('#gen-panels');
  if (!app.chapter) { box.replaceChildren(emptyState('還沒有章節——右上角「＋」新增,或到「分鏡」用網址匯入。')); return; }
  const sb = await data.loadStoryboard(app.chapter);
  const chars = await data.listCharacters();
  if (!sb.panels.length) { box.replaceChildren(emptyState('此章還沒有分鏡,先到「分鏡」產生。')); return; }
  box.replaceChildren(...await Promise.all(sb.panels.map((p, i) => renderPanel(p, i, chars))));
}

// 生一格:回傳新增張數(批量與單格共用)
async function generatePanel(p, chars, { count, size, onStatus }) {
  const provider = getProvider(app.meta?.providers.image);
  if (!provider) throw new Error('未設定生圖模型(到「專案」選擇)');
  const worlds = await data.listWorld();
  const scenes = await data.listScenes(app.chapter);
  const scene = scenes.find(s => s.id === p.scene_id) || null;
  // changes 要知道「這一格排在第幾」才判斷得出哪些變更已經發生
  const allPanels = (await data.loadStoryboard(app.chapter)).panels || [];
  // 場次的 world/機位當預設:整場共用的東西寫一次,單格要覆寫再自己填
  if (scene) {
    if (!(p.world || []).length && scene.world) p = { ...p, world: scene.world };
    if (!p.camera && scene.camera_default) p = { ...p, camera: scene.camera_default };
  }
  const promptText = [
    buildPanelPrompt({ style: app.meta.style, panel: p, characterCards: chars, worldCards: worlds, rules: app.meta.rules || [] }),
    (!p.continues && !(p.world || []).length && !p.characters.length)
      ? '這一格沒有人也沒有指定場景。**不要畫成照片**:不要攝影般的淺景深散景、不要真實照片質感,'
        + '維持跟其他格一樣的繪畫感動畫背景。附上的參考圖只提供畫風,不要複製它的內容。'
      : '',
  ].filter(Boolean).join('\n');
  // 參考圖:立繪必附;該格寫了表情就附表情集,是動作鏡頭就附動作集。
  // 上限 4 張——再多張特徵會互相污染(cast-lock 實測)。
  const scene = `${p.scene || ''} ${p.shot || ''}`;
  const wantExpr = /表情|情緒|臉/.test(scene);
  const wantPose = /動作|全身|奔跑|跑|走|坐|蹲|站|撲|倒|伸手|後退/.test(scene);
  // 參考圖優先序:場景/道具鎖 → 每個出場角色的立繪(保底一張)→ 剩餘額度輪流補表情/動作。
  // (先前是逐角色塞滿,三人同框時第三個人連立繪都被截掉=保證漂移)
  // 上限看 provider:codex 那條 API 沒有張數限制(實測 reference_images_base64 無 max_items),
  // gemini-web 只吃單張、多張會被併成一張,張數一多每張就變小,所以維持 4。
  const MAX_REFS = app.meta?.providers.image === 'codex-image-service' ? 8 : 4;
  const present = chars.filter(c => p.characters.includes(c.id) || p.characters.includes(c.name));
  const refDataURLs = [];
  // 承前格:前一格的成品同時帶著場景、角色與姿勢,是最強的連戲訊號,所以排第一
  if (p.continues) {
    const prev = await data.loadPanelState(app.chapter, p.continues).catch(() => null);
    if (prev?.chosen) {
      const u = await data.panelImageURL(app.chapter, p.continues, prev.chosen);
      if (u) {
        const blob = await (await fetch(u)).blob();
        refDataURLs.push(await new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(blob); }));
      }
    }
  }
  // 承前格不存在、也沒有任何場景/角色可附時,畫風就沒有錨——補一張(見 data.styleAnchorDataURL)
  const needAnchor = !p.continues && !(p.world || []).length && !p.characters.length;
  if (needAnchor) {
    const a = await data.styleAnchorDataURL();
    if (a) refDataURLs.push(a);
  }
  for (const id of (p.world || [])) {
    if (refDataURLs.length >= MAX_REFS) break;
    const w = await data.worldRefDataURL(id);
    if (w) refDataURLs.push(w);
    if (refDataURLs.length >= MAX_REFS) break;
    // 有指定機位才附平面圖:沒指定的話模型不知道要站在哪裡看,平面圖只會變成雜訊
    if (p.camera) {
      const plan = await data.worldPlanDataURL(id);
      if (plan) refDataURLs.push(plan);
    }
  }
  for (const c of present) {
    const ref = await data.charSheetDataURL(c.id, 'ref.png');
    if (ref) refDataURLs.push(ref);
  }
  for (const file of [...(wantExpr ? ['expr.png'] : []), ...(wantPose ? ['pose.png'] : [])]) {
    for (const c of present) {
      if (refDataURLs.length >= MAX_REFS) break;
      const s = await data.charSheetDataURL(c.id, file);
      if (s) refDataURLs.push(s);
    }
  }
  refDataURLs.length = Math.min(refDataURLs.length, MAX_REFS);
  const imgs = await generateImages({ provider, prompt: promptText, refDataURLs, count, size, onStatus });
  const existing = await data.listCandidates(app.chapter, p.id);
  let n = existing.length;
  for (const img of imgs) {
    n += 1;
    await store.writeBlob(data.chapterPath(app.chapter, `panels/${p.id}/cand-${n}.png`), store.dataURLtoBlob(img));
  }
  // 還沒選定的自動選第一張新圖,匯出不會卡住;之後隨時可換
  const st = await data.loadPanelState(app.chapter, p.id);
  if (!st.chosen && imgs.length) {
    st.chosen = `cand-${existing.length + 1}.png`;
    await data.savePanelState(app.chapter, p.id, st);
  }
  return imgs.length;
}

// ── 整章批量 ──
async function runBatch() {
  const sb = await data.loadStoryboard(app.chapter || '');
  if (!sb.panels.length) { toast('此章沒有分鏡'); return; }
  const chars = await data.listCharacters();
  const todo = [];
  for (const p of sb.panels) {
    if (!(await data.listCandidates(app.chapter, p.id)).length) todo.push(p);
  }
  if (!todo.length) { toast('每一格都已有候選圖(要重生請到各格按「再生成」)'); return; }

  const btn = $('#gen-batch');
  btn.textContent = '停止批量';
  stopBatch = false;
  btn.onclick = () => { stopBatch = true; btn.textContent = '停止中…'; };

  const prog = progressBar();
  $('#gen-progress').replaceChildren(prog.el);
  const count = Number($('#gen-count').value);
  const size = $('#gen-size').value;
  let done = 0, failed = 0;
  for (const p of todo) {
    if (stopBatch) break;
    prog.set(done, todo.length, `第 ${p.order} 格生成中… ${done}/${todo.length}(可切到其他步驟,別關分頁)`);
    try {
      await generatePanel(p, chars, { count, size, onStatus: () => {} });
    } catch (e) {
      failed += 1;
      toast(`第 ${p.order} 格失敗:${e.message}`);
      if (failed >= 3) { toast('連續失敗,批量中止'); break; }
    }
    done += 1;
  }
  prog.set(done, todo.length, stopBatch ? `已停止:完成 ${done}/${todo.length}` : `完成 ${done}/${todo.length}` + (failed ? `(${failed} 格失敗)` : ''));
  btn.textContent = '批量生成整章';
  btn.onclick = runBatch;
  await render();
}
$('#gen-batch').onclick = runBatch;

async function renderPanel(p, i, chars) {
  const promptText = buildPanelPrompt({ style: app.meta.style, panel: p, characterCards: chars });
  const st = await data.loadPanelState(app.chapter, p.id);
  const cands = await data.listCandidates(app.chapter, p.id);

  const candRow = h('div', { class: 'cand-row' });
  for (const name of cands) {
    const url = await data.panelImageURL(app.chapter, p.id, name);
    const cell = h('div', { class: 'cand' + (st.chosen === name ? ' chosen' : '') }, h('img', { src: url, alt: name }));
    cell.onclick = () => lightbox(url, [{
      label: st.chosen === name ? '已是選定' : '選定這張',
      primary: true,
      onClick: async () => {
        st.chosen = name;
        await data.savePanelState(app.chapter, p.id, st);
        candRow.querySelectorAll('.cand').forEach(el => el.classList.toggle('chosen', el === cell));
      },
    }]);
    candRow.append(cell);
  }

  const status = h('span', { class: 'status' });
  const genBtn = h('button', { class: cands.length ? '' : 'primary', onclick: async () => {
    genBtn.disabled = true;
    try {
      await generatePanel(p, chars, {
        count: Number($('#gen-count').value),
        size: $('#gen-size').value,
        onStatus: m => { status.textContent = m; },
      });
      await render();
    } catch (e) {
      status.textContent = '失敗:' + e.message;
      status.classList.add('err');
      genBtn.disabled = false;
    }
  } }, cands.length ? '再生成' : '生成');

  return h('div', { class: 'gen-panel' },
    h('div', { class: 'head' },
      h('span', { class: 'num' }, String(p.order)),
      h('span', { class: 'scene' }, p.scene.slice(0, 72) || '(無畫面描述)'),
    ),
    h('details', {}, h('summary', {}, '看這格的 prompt'), h('div', { class: 'prompt-preview' }, promptText)),
    h('div', { class: 'row' }, genBtn, status, st.chosen ? h('span', { class: 'chosen-mark' }, '✓ 已選定') : null),
    candRow,
  );
}
