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
  return h('div', { class: 'char-card' },
    h('div', { class: 'sheet-strip' }, h('div', { class: 'sheet' },
      url ? h('img', { src: url, alt: w.name, onclick: () => lightbox(url) }) : h('div', { class: 'noimg' }, '無'),
      h('span', {}, '參考圖'),
    )),
    h('div', { class: 'cid' }, 'id:' + w.id),
    h('label', {}, '名字', h('input', { value: w.name, onchange: e => { w.name = e.target.value; data.saveWorld(w); } })),
    h('label', {}, '設定卡(場景或道具的外觀,越具體越穩)', h('textarea', { rows: 4, onchange: e => { w.card = e.target.value; data.saveWorld(w); } }, w.card || '')),
    h('label', {}, '絕對不可出現', h('input', { value: w.must_not || '', placeholder: '例:玻璃、印刷招牌、旗幟紋章', onchange: e => { w.must_not = e.target.value; data.saveWorld(w); } })),
    h('div', { class: 'actions' },
      h('button', { onclick: () => genRef(w) }, '生成參考圖'),
      h('button', { onclick: () => uploadRef(w) }, '上傳參考圖'),
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
