// 角色庫站
import { $, h, toast, setStatus } from './ui.js';
import * as store from './store.js';
import * as data from './data.js';
import { getProvider, generateImages } from './providers.js';
import { app } from './app.js';

export async function refreshCharacters() {
  const chars = await data.listCharacters();
  const box = $('#char-list');
  box.replaceChildren(...await Promise.all(chars.map(renderCard)));
}

async function renderCard(c) {
  const url = await data.charRefURL(c.id);
  return h('div', { class: 'char-card' },
    url ? h('img', { src: url, alt: c.name }) : h('div', { class: 'noimg' }, '尚無設定圖'),
    h('label', {}, 'id(分鏡用)', h('input', { value: c.id, disabled: true })),
    h('label', {}, '名字', h('input', { value: c.name, onchange: e => { c.name = e.target.value; data.saveCharacter(c); } })),
    h('label', {}, '外觀設定卡', h('textarea', { rows: 4, onchange: e => { c.card = e.target.value; data.saveCharacter(c); } }, c.card)),
    h('div', { class: 'row' },
      h('button', { onclick: () => genRef(c) }, 'AI 生成設定圖'),
      h('button', { onclick: () => uploadRef(c) }, '上傳設定圖'),
      h('button', { class: 'danger', onclick: async () => { if (confirm(`刪除角色 ${c.name}?`)) { await store.removeEntry('characters/' + c.id); refreshCharacters(); } } }, '刪除'),
    ),
  );
}

$('#add-char').onclick = async () => {
  const id = prompt('角色 id(英文小寫,分鏡腳本用它指涉角色,例如 yaze)?');
  if (!id || !/^[a-z0-9-]+$/.test(id)) { if (id != null) toast('id 限英文小寫/數字/連字號'); return; }
  const name = prompt('角色名字?') || id;
  await data.saveCharacter({ id, name, card: '' });
  refreshCharacters();
};

async function genRef(c) {
  const provider = getProvider(app.meta?.providers.image);
  if (!provider) { toast('未設定生圖模型(專案頁選擇)'); return; }
  if (!c.card.trim()) { toast('請先填外觀設定卡'); return; }
  try {
    setStatus('#char-status', `生成 ${c.name} 設定圖…`);
    const prompt = [
      `畫風: ${app.meta.style}`,
      `角色設定圖(character reference sheet):${c.name}`,
      `外觀: ${c.card}`,
      '全身立繪,正面站姿,單純淺色背景,清楚呈現臉部與服裝細節。',
      '圖中不要出現任何文字或浮水印。',
    ].join('\n');
    const [img] = await generateImages({ provider, prompt, count: 1, size: '1024x1536', onStatus: m => setStatus('#char-status', m) });
    await store.writeBlob(`characters/${c.id}/ref.png`, store.dataURLtoBlob(img));
    setStatus('#char-status', `${c.name} 設定圖完成`);
    refreshCharacters();
  } catch (e) {
    setStatus('#char-status', '失敗:' + e.message, true);
  }
}

function uploadRef(c) {
  const input = h('input', { type: 'file', accept: 'image/*' });
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    await store.writeBlob(`characters/${c.id}/ref.png`, file);
    toast('設定圖已存檔');
    refreshCharacters();
  };
  input.click();
}
