// 角色站:設定卡+設定圖(單張/多視角)+去重合併
import { $, h, toast, setStatus, modal, confirmDialog, lightbox } from './ui.js';
import * as store from './store.js';
import * as data from './data.js';
import { getProvider, generateImages } from './providers.js';
import { buildCharacterSheetPrompt, buildExpressionSheetPrompt, buildPoseSheetPrompt } from './prompt.js';
import { applyCharacterMerge } from './merge.js';
import { app, requireProject } from './app.js';

export async function refreshCharacters() {
  const box = $('#char-list');
  if (!requireProject(box)) return;
  const chars = await data.listCharacters();
  if (!chars.length) {
    box.replaceChildren(h('div', { class: 'empty-state', style: { gridColumn: '1/-1' } },
      h('div', { class: 'empty-tone' }),
      h('p', {}, '還沒有角色。先建主要角色再跑分鏡,AI 會直接用角色 id,一致性最好。')));
    return;
  }
  box.replaceChildren(...await Promise.all(chars.map(c => renderCard(c, chars))));
}

async function renderCard(c, all) {
  const sheets = [];
  for (const s of data.CHAR_SHEETS) {
    let u = null;
    try { u = await data.charSheetURL(c.id, s.file); } catch { /* 沒這張就跳過 */ }
    sheets.push({ ...s, url: u });
  }
  const strip = h('div', { class: 'sheet-strip' }, ...sheets.map(s => h('div', { class: 'sheet' },
    s.url ? h('img', { src: s.url, alt: `${c.name} ${s.label}`, onclick: () => lightbox(s.url) })
          : h('div', { class: 'noimg' }, '無'),
    h('span', {}, s.label),
  )));
  return h('div', { class: 'char-card' },
    strip,
    h('div', { class: 'cid' }, 'id:' + c.id),
    h('label', {}, '名字', h('input', { value: c.name, onchange: e => { c.name = e.target.value; data.saveCharacter(c); } })),
    h('label', {}, '讀者介紹(中文,匯出的角色頁用;留空則顯示設定卡)', h('textarea', { rows: 3, onchange: e => { c.bio = e.target.value; data.saveCharacter(c); } }, c.bio || '')),
    h('label', {}, '外觀設定卡', h('textarea', { rows: 4, placeholder: '髮型、體型、服裝、特徵…越具體越穩', onchange: e => { c.card = e.target.value; data.saveCharacter(c); } }, c.card)),
    h('label', {}, '絕對不可出現(模型最愛自己補的東西:帽子、眼鏡、現代服裝…)', h('input', { value: c.must_not || '', placeholder: '例:頭帶或任何帽子、十字架、現代服裝', onchange: e => { c.must_not = e.target.value; data.saveCharacter(c); } })),
    h('div', { class: 'actions' },
      h('button', { onclick: () => genRef(c, false) }, '生成立繪'),
      h('button', { onclick: () => genRef(c, true), title: '三視角,一致性更穩' }, '多視角設定圖'),
      h('button', { onclick: () => genSheet(c, 'expr'), title: '九宮格情緒;沒有它,每格的臉都會趨中' }, '表情集'),
      h('button', { onclick: () => genSheet(c, 'pose'), title: '九宮格全身動態' }, '動作集'),
      h('button', { onclick: () => uploadRef(c) }, '上傳立繪'),
      h('button', { onclick: () => mergeChar(c, all) }, '合併…'),
      h('button', { class: 'danger', onclick: async () => {
        if (await confirmDialog(`刪除角色 ${c.name}?`, '刪除')) { await store.removeEntry('characters/' + c.id); refreshCharacters(); }
      } }, '刪'),
    ),
  );
}

$('#add-char').onclick = async () => {
  if (!store.hasProject()) { toast('請先開啟專案資料夾'); return; }
  const r = await modal({
    title: '新增角色',
    fields: [
      { key: 'id', label: 'id(分鏡腳本用它指涉角色,中文可以,建議直接用角色名)', placeholder: '亞澤' },
      { key: 'name', label: '顯示名字(留空=同 id)', placeholder: '亞澤' },
      { key: 'card', label: '外觀設定卡', type: 'textarea', placeholder: '黑髮微亂,深色皮外套…' },
    ],
    confirmText: '建立',
  });
  if (!r) return;
  if (!r.id || /[/\\]/.test(r.id)) { toast('id 不能空白或含斜線'); return; }
  await data.saveCharacter({ id: r.id, name: r.name || r.id, card: r.card || '' });
  refreshCharacters();
};

async function genRef(c, sheet) {
  const provider = getProvider(app.meta?.providers.image);
  if (!provider) { toast('未設定生圖模型(到「專案」選擇)'); return; }
  if (!c.card.trim()) { toast('請先填外觀設定卡'); return; }
  try {
    setStatus('#char-status', `生成 ${c.name} ${sheet ? '多視角設定圖' : '立繪'}…`);
    const prompt = sheet
      ? buildCharacterSheetPrompt({ style: app.meta.style, name: c.name, card: c.card })
      : [
          `畫風: ${app.meta.style}`,
          `角色設定圖:${c.name}`,
          `外觀: ${c.card}`,
          '全身立繪,正面站姿,單純淺色背景,清楚呈現臉部與服裝細節。',
          '圖中不要出現任何文字或浮水印。',
        ].join('\n');
    // 已有設定圖時當參考傳入,長相不會重抽
    const existing = await data.charRefDataURL(c.id);
    const [img] = await generateImages({
      provider, prompt, refDataURLs: existing ? [existing] : [],
      count: 1, size: sheet ? '1536x1024' : '1024x1536',
      onStatus: m => setStatus('#char-status', m),
    });
    await store.writeBlob(`characters/${c.id}/ref.png`, store.dataURLtoBlob(img));
    setStatus('#char-status', `${c.name} 完成`);
    refreshCharacters();
  } catch (e) {
    setStatus('#char-status', '失敗:' + e.message, true);
  }
}

// 表情集/動作集:一定要以立繪當參考圖,否則等於重抽一個人
async function genSheet(c, kind) {
  const provider = getProvider(app.meta?.providers.image);
  if (!provider) { toast('未設定生圖模型(到「專案」選擇)'); return; }
  const base = await data.charSheetDataURL(c.id, 'ref.png');
  if (!base) { toast('請先有立繪,表情/動作集要照著它畫'); return; }
  const label = kind === 'expr' ? '表情集' : '動作集';
  try {
    setStatus('#char-status', `生成 ${c.name} ${label}…`);
    const prompt = kind === 'expr'
      ? buildExpressionSheetPrompt({ style: app.meta.style, name: c.name, card: c.card })
      : buildPoseSheetPrompt({ style: app.meta.style, name: c.name, card: c.card });
    const [img] = await generateImages({
      provider, prompt, refDataURLs: [base], count: 1, size: '1536x1024',
      onStatus: m => setStatus('#char-status', m),
    });
    await store.writeBlob(`characters/${c.id}/${kind}.png`, store.dataURLtoBlob(img));
    setStatus('#char-status', `${c.name} ${label} 完成`);
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

// 合併:把分鏡裡對 c(id 與名字)的引用全改成目標角色,然後刪掉 c
async function mergeChar(c, all) {
  const others = all.filter(o => o.id !== c.id);
  if (!others.length) { toast('沒有其他角色可合併'); return; }
  const r = await modal({
    title: `把「${c.name}」合併進…`,
    body: '所有章節分鏡裡引用這個角色的格,都會改成目標角色,然後刪除這個角色(設定圖一併刪除)。',
    fields: [{ key: 'to', label: '目標角色', type: 'select', value: others[0].id, options: others.map(o => ({ value: o.id, label: `${o.name}(${o.id})` })) }],
    confirmText: '合併',
    danger: true,
  });
  if (!r) return;
  let totalTouched = 0;
  for (const ch of await data.listChapters()) {
    const sb = await data.loadStoryboard(ch.dir);
    const touched = applyCharacterMerge(sb, [c.id, c.name], r.to);
    if (touched) { await data.saveStoryboard(ch.dir, sb); totalTouched += touched; }
  }
  await store.removeEntry('characters/' + c.id);
  toast(`已合併:${totalTouched} 格分鏡改指向新角色`);
  refreshCharacters();
}
