// 世界站:場景與道具的設定卡+參考圖。跟角色站同一套操作,差別是它不是人——
// 分鏡用 panel.world 指名,生圖時當這一格的場景鎖附上去。
import { $, h, toast, setStatus, modal, confirmDialog, lightbox } from './ui.js';
import * as store from './store.js';
import * as data from './data.js';
import { getProvider, generateImages } from './providers.js';
import { buildWorldRefPrompt } from './prompt.js';
import { app, requireProject } from './app.js';

export async function refreshWorld() {
  const box = $('#world-list');
  if (!requireProject(box)) return;
  const items = await data.listWorld();
  if (!items.length) {
    box.replaceChildren(h('div', { class: 'empty-state', style: { gridColumn: '1/-1' } },
      h('div', { class: 'empty-tone' }),
      h('p', {}, '還沒有場景或道具。同一個大廳、同一條街如果沒有鎖,每一格都會重抽一個樣子。')));
    return;
  }
  box.replaceChildren(...await Promise.all(items.map(renderCard)));
}

async function renderCard(w) {
  let url = null;
  try { url = await store.readBlobURL(`world/${w.id}/ref.png`); } catch { /* 還沒生 */ }
  let planUrl = null;
  try { planUrl = await store.readBlobURL(`world/${w.id}/plan.png`); } catch { /* 沒有平面圖 */ }
  const cams = Object.keys(w.cameras || {});
  const camShots = [];
  for (const c of cams) {
    let u = null;
    try { u = await store.readBlobURL(`world/${w.id}/plan-${c}.png`); } catch { /* 還沒產 */ }
    camShots.push(h('div', { class: 'sheet' },
      u ? h('img', { src: u, alt: `機位 ${c}`, onclick: () => lightbox(u) }) : h('div', { class: 'noimg' }, '未產'),
      h('span', {}, '機位 ' + c)));
  }
  return h('div', { class: 'char-card' },
    h('div', { class: 'sheet-strip' },
      h('div', { class: 'sheet' },
        url ? h('img', { src: url, alt: w.name, onclick: () => lightbox(url) }) : h('div', { class: 'noimg' }, '無'),
        h('span', {}, '參考圖')),
      h('div', { class: 'sheet' },
        planUrl ? h('img', { src: planUrl, alt: '平面圖', onclick: () => lightbox(planUrl) }) : h('div', { class: 'noimg' }, '無'),
        h('span', {}, '平面配置圖')),
      ...camShots,
    ),
    h('div', { class: 'cid' }, 'id:' + w.id),
    h('label', {}, '名字', h('input', { value: w.name, onchange: e => { w.name = e.target.value; data.saveWorld(w); } })),
    h('label', {}, '設定卡(場景或道具的外觀,越具體越穩)', h('textarea', { rows: 4, onchange: e => { w.card = e.target.value; data.saveWorld(w); } }, w.card || '')),
    h('label', {}, '絕對不可出現', h('input', { value: w.must_not || '', placeholder: '例:玻璃、印刷招牌、旗幟紋章', onchange: e => { w.must_not = e.target.value; data.saveWorld(w); } })),
    h('label', {}, '固定站位/座位與人數(整場不變,鎖「誰在哪裡」)',
      h('textarea', { rows: 3, placeholder: '例:主位坐長桌遠端面向門;主角在西側由門數來第三位;大廳固定 12-14 人',
        onchange: e => { w.seating = e.target.value; data.saveWorld(w); } }, w.seating || '')),
    ...cams.map(c => h('label', { class: 'cam-row' }, `機位 ${c}`,
      h('input', { value: (w.cameras || {})[c] || '', placeholder: '這個機位看到什麼(由近到遠)',
        onchange: e => { w.cameras[c] = e.target.value; data.saveWorld(w); } }),
      h('button', { onclick: () => placeCamera(w, c), title: '在平面圖上點一下設位置,再點一下定方向' }, '在圖上設定'),
    )),
    h('div', { class: 'actions' },
      h('button', { onclick: () => addCamera(w) }, '＋機位'),
      h('button', { onclick: () => genRef(w) }, '生成參考圖'),
      h('button', { onclick: () => uploadRef(w) }, '上傳參考圖'),
      h('button', { onclick: () => uploadPlan(w) }, '上傳平面圖'),
      h('button', { class: 'danger', onclick: async () => {
        if (await confirmDialog(`刪除 ${w.name}?`, '刪除')) { await store.removeEntry('world/' + w.id); refreshWorld(); }
      } }, '刪'),
    ),
  );
}

$('#add-world').onclick = async () => {
  if (!store.hasProject()) { toast('請先開啟專案資料夾'); return; }
  const r = await modal({
    title: '新增場景／道具',
    fields: [
      { key: 'id', label: 'id(分鏡用它指涉;同一個城鎮的建議加前綴,例 node_guild_hall)', placeholder: 'node_guild_hall' },
      { key: 'name', label: '名字', placeholder: '諾德公會大廳' },
    ],
  });
  if (!r || !r.id) return;
  await data.saveWorld({ id: r.id.trim(), name: (r.name || r.id).trim(), card: '', must_not: '' });
  refreshWorld();
};

async function genRef(w) {
  const provider = getProvider(app.meta?.providers.image);
  if (!provider) { toast('未設定生圖模型(到「專案」選擇)'); return; }
  if (!(w.card || '').trim()) { toast('請先填設定卡'); return; }
  try {
    setStatus('#world-status', `生成 ${w.name}…`);
    const imgs = await generateImages({
      provider,
      prompt: buildWorldRefPrompt({ style: app.meta.style, name: w.name, card: w.card, must_not: w.must_not }),
      count: 1,
      size: '1536x1024',
      onStatus: m => setStatus('#world-status', m),
    });
    if (!imgs.length) throw new Error('沒有回傳圖片');
    await store.writeBlob(`world/${w.id}/ref.png`, store.dataURLtoBlob(imgs[0]));
    setStatus('#world-status', `${w.name} 完成`);
    refreshWorld();
  } catch (e) {
    setStatus('#world-status', '失敗:' + e.message, true);
  }
}

async function uploadRef(w) {
  const f = document.createElement('input');
  f.type = 'file'; f.accept = 'image/*';
  f.onchange = async () => {
    if (!f.files[0]) return;
    await store.writeBlob(`world/${w.id}/ref.png`, f.files[0]);
    refreshWorld();
  };
  f.click();
}

// ── 機位:在平面圖上用點的 ──
// 機位是幾何,用文字描述(「站在櫃檯前方偏右」)模型轉不過來,人也講不準。
// 在圖上點兩下:第一下定位置、第二下定方向,然後把「只有這個機位 + 視野扇形」
// 的圖存成 plan-<代號>.png,生圖時附這張。一張圖只有一個機位,沒有可以認錯的東西。

async function addCamera(w) {
  const r = await modal({ title: '新增機位', fields: [
    { key: 'id', label: '代號(一個字母,例 A)', placeholder: 'A' },
    { key: 'desc', label: '這個機位看到什麼(由近到遠)', placeholder: '從門口往裡看:近景排隊背影、遠景櫃檯' },
  ] });
  if (!r || !r.id) return;
  w.cameras = w.cameras || {};
  w.cameras[r.id.trim()] = (r.desc || '').trim();
  await data.saveWorld(w);
  refreshWorld();
}

// 把「一個機位 + 視野扇形」畫到平面圖上,回傳 blob
async function drawPlan(planImg, g, cam) {
  const cv = document.createElement('canvas');
  cv.width = planImg.naturalWidth; cv.height = planImg.naturalHeight;
  const cx2 = cv.getContext('2d');
  cx2.drawImage(planImg, 0, 0);
  const cx = g.x * cv.width, cy = g.y * cv.height;
  const len = Math.min(cv.width, cv.height) * 0.78;
  const a0 = (g.deg - g.fov / 2) * Math.PI / 180, a1 = (g.deg + g.fov / 2) * Math.PI / 180;
  cx2.beginPath();
  cx2.moveTo(cx, cy);
  for (let i = 0; i <= 24; i += 1) {
    const a = a0 + (a1 - a0) * i / 24;
    cx2.lineTo(cx + len * Math.cos(a), cy - len * Math.sin(a));   // y 軸向下
  }
  cx2.closePath();
  cx2.fillStyle = 'rgba(255,90,40,.28)'; cx2.fill();
  cx2.strokeStyle = 'rgba(255,90,40,.85)'; cx2.lineWidth = 5; cx2.stroke();
  const r = Math.min(cv.width, cv.height) * 0.035;
  cx2.beginPath(); cx2.arc(cx, cy, r, 0, Math.PI * 2);
  cx2.fillStyle = '#ff5a28'; cx2.fill();
  cx2.strokeStyle = '#3c1408'; cx2.lineWidth = 4; cx2.stroke();
  cx2.fillStyle = '#fff'; cx2.font = `bold ${Math.round(r * 1.4)}px sans-serif`;
  cx2.textAlign = 'center'; cx2.textBaseline = 'middle';
  cx2.fillText(cam, cx, cy);
  return new Promise(ok => cv.toBlob(ok, 'image/png'));
}

async function placeCamera(w, cam) {
  let planUrl;
  try { planUrl = await store.readBlobURL(`world/${w.id}/plan.png`); }
  catch { toast('這個場景還沒有平面圖,先上傳一張'); return; }
  const img = new Image();
  await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; img.src = planUrl; });

  const view = h('img', { src: planUrl, class: 'plan-edit' });
  const hint = h('p', { class: 'status' }, '第一下:點鏡頭站的位置。第二下:點它面對的方向。');
  const box = h('div', { class: 'plan-wrap' }, view, hint);
  const done = modal({ title: `機位 ${cam}:在平面圖上設定`, body: box, confirmText: '完成' });

  const g = { ...(w.camera_geo?.[cam] || {}), fov: (w.camera_geo?.[cam]?.fov) || 60 };
  let stage = 0;
  view.onclick = async (e) => {
    const r = view.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width, ny = (e.clientY - r.top) / r.height;
    if (stage === 0) {
      g.x = nx; g.y = ny; stage = 1;
      hint.textContent = '再點一下:鏡頭面對的方向。';
      return;
    }
    // 第二下決定朝向(畫面 y 向下,所以取負)
    g.deg = Math.atan2(-(ny - g.y), nx - g.x) * 180 / Math.PI;
    w.camera_geo = w.camera_geo || {};
    w.camera_geo[cam] = { x: +g.x.toFixed(4), y: +g.y.toFixed(4), deg: +g.deg.toFixed(1), fov: g.fov };
    await data.saveWorld(w);
    const blob = await drawPlan(img, w.camera_geo[cam], cam);
    await store.writeBlob(`world/${w.id}/plan-${cam}.png`, blob);
    toast(`機位 ${cam} 已更新`);
    view.closest('dialog')?.close();
    refreshWorld();
  };
  await done;
  refreshWorld();
}

async function uploadPlan(w) {
  const f = document.createElement('input');
  f.type = 'file'; f.accept = 'image/*';
  f.onchange = async () => {
    if (!f.files[0]) return;
    await store.writeBlob(`world/${w.id}/plan.png`, f.files[0]);
    refreshWorld();
  };
  f.click();
}
