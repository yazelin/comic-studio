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
  const sceneDef = scenes.find(s => s.id === p.scene_id) || null;
  // changes 要知道「這一格排在第幾」才判斷得出哪些變更已經發生
  const allPanels = (await data.loadStoryboard(app.chapter)).panels || [];
  // 場次的 world/機位當預設:整場共用的東西寫一次,單格要覆寫再自己填
  if (sceneDef) {
    if (!(p.world || []).length && sceneDef.world) p = { ...p, world: sceneDef.world };
    if (!p.camera && sceneDef.camera_default) p = { ...p, camera: sceneDef.camera_default };
  }
  const promptText = [
    buildPanelPrompt({ style: app.meta.style, panel: p, characterCards: chars, worldCards: worlds, rules: app.meta.rules || [] }),
    (!p.continues && !(p.world || []).length && !p.characters.length)
      ? '這一格沒有人也沒有指定場景。**不要畫成照片**:不要攝影般的淺景深散景、不要真實照片質感,'
        + '維持跟其他格一樣的繪畫感動畫背景。附上的參考圖只提供畫風,不要複製它的內容。'
      : '',
  ].filter(Boolean).join('\n');
  const items = await collectRefs(p, chars, { chapter: app.chapter, provider: app.meta?.providers.image });
  const stForRefs = await data.loadPanelState(app.chapter, p.id);
  const off = new Set(stForRefs.ref_off || []);
  const refDataURLs = items.filter(i => !off.has(i.key)).map(i => i.data);
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

// 這一格會送哪些參考圖。抽成函式是為了讓「生圖」頁能把清單畫出來——
// 參考圖看不到的時候,矛盾(例如正視圖與平面圖不是同一個房間)只能靠猜。
// 順序即優先序:平面圖(空間的唯一事實來源)→ 正視圖(材質光線)→ 角色立繪
// → 承前格(只承接人物與光線)→ 表情/動作集。上限看 provider。
export async function collectRefs(p, chars, { chapter, provider }) {
  const MAX_REFS = provider === 'codex-image-service' ? 8 : 4;
  const worlds = await data.listWorld();
  const nameOf = id => worlds.find(w => w.id === id)?.name || id;
  const out = [];
  const push = (key, label, dataOrNull) => { if (dataOrNull && out.length < MAX_REFS) out.push({ key, label, data: dataOrNull }); };

  for (const id of (p.world || [])) {
    if (p.camera) push(`plan:${id}`, `${nameOf(id)} 平面圖(機位 ${p.camera})`, await data.worldPlanDataURL(id, p.camera));
    push(`world:${id}`, `${nameOf(id)} 正視圖`, await data.worldRefDataURL(id));
  }
  const present = chars.filter(c => p.characters.includes(c.id) || p.characters.includes(c.name));
  for (const c of present) push(`char:${c.id}`, `${c.name} 立繪`, await data.charSheetDataURL(c.id, 'ref.png'));

  if (p.continues) {
    const prev = await data.loadPanelState(chapter, p.continues).catch(() => null);
    if (prev?.chosen) {
      const u = await data.panelImageURL(chapter, p.continues, prev.chosen);
      if (u) {
        const blob = await (await fetch(u)).blob();
        const d = await new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(blob); });
        push(`cont:${p.continues}`, `承接 ${p.continues}(只給人物與光線)`, d);
      }
    }
  }
  const txt = `${p.scene || ''} ${p.shot || ''}`;
  const wantExpr = /表情|情緒|臉/.test(txt);
  const wantPose = /動作|全身|奔跑|跑|走|坐|蹲|站|撲|倒|伸手|後退/.test(txt);
  for (const file of [...(wantExpr ? ['expr.png'] : []), ...(wantPose ? ['pose.png'] : [])]) {
    for (const c of present) {
      push(`${file === 'expr.png' ? 'expr' : 'pose'}:${c.id}`,
        `${c.name} ${file === 'expr.png' ? '表情集' : '動作集'}`, await data.charSheetDataURL(c.id, file));
    }
  }
  // 沒有人也沒有場景時畫風沒有錨,會漂成照片
  if (!out.length || (!(p.world || []).length && !present.length && !p.continues)) {
    push('style', '畫風錨(這一格沒有人,不補會漂成照片)', await data.styleAnchorDataURL());
  }
  return out;
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

  // 參考圖清單:看得見才查得出矛盾(例如正視圖與平面圖不是同一個房間)。
  // 取消勾選會存進 panel.json 的 ref_off,只影響這一格。
  const refRow = h('div', { class: 'ref-row' }, h('span', { class: 'ref-label' }, '參考圖:'));
  const items = await collectRefs(p, chars, { chapter: app.chapter, provider: app.meta?.providers.image });
  st.ref_off = st.ref_off || [];
  if (!items.length) refRow.append(h('span', { class: 'status' }, '(這一格沒有任何參考圖——空鏡容易漂成照片)'));
  for (const it of items) {
    const on = !st.ref_off.includes(it.key);
    const cell = h('label', { class: 'ref-chip' + (on ? '' : ' off'), title: it.key },
      h('input', { type: 'checkbox', checked: on, onchange: async (e) => {
        const set = new Set(st.ref_off);
        e.target.checked ? set.delete(it.key) : set.add(it.key);
        st.ref_off = [...set];
        await data.savePanelState(app.chapter, p.id, st);
        cell.classList.toggle('off', !e.target.checked);
      } }),
      h('img', { src: it.data, alt: it.label, onclick: (e) => { e.preventDefault(); lightbox(it.data); } }),
      h('span', {}, it.label));
    refRow.append(cell);
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
    refRow,
    h('div', { class: 'row' }, genBtn, status, st.chosen ? h('span', { class: 'chosen-mark' }, '✓ 已選定') : null),
    candRow,
  );
}
