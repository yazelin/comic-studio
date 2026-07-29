// 生圖站:逐格生成、多候選、選定
import { $, h, toast } from './ui.js';
import * as store from './store.js';
import * as data from './data.js';
import { getProvider, generateImages } from './providers.js';
import { buildPanelPrompt } from './prompt.js';
import { app } from './app.js';

let dir = null;

export async function refreshGenerate() {
  const chapters = await data.listChapters();
  const sel = $('#gen-chapter');
  sel.replaceChildren(...chapters.map(c => h('option', { value: c.dir, selected: c.dir === dir }, `${c.dir} ${c.title}`)));
  sel.onchange = render;
  if (!dir && chapters.length) dir = chapters[0].dir;
  if (dir) { sel.value = dir; await render(); }
  else $('#gen-panels').replaceChildren(h('p', { class: 'hint' }, '先到「章節分鏡」建立章節與分鏡。'));
}

async function render() {
  dir = $('#gen-chapter').value;
  const sb = await data.loadStoryboard(dir);
  const chars = await data.listCharacters();
  const box = $('#gen-panels');
  if (!sb.panels.length) { box.replaceChildren(h('p', { class: 'hint' }, '此章尚無分鏡。')); return; }
  box.replaceChildren(...await Promise.all(sb.panels.map(p => renderPanel(p, chars))));
}

async function renderPanel(p, chars) {
  const cast = chars.filter(c => p.characters.includes(c.id) || p.characters.includes(c.name));
  const promptText = buildPanelPrompt({ style: app.meta.style, panel: p, characterCards: chars });
  const st = await data.loadPanelState(dir, p.id);
  const cands = await data.listCandidates(dir, p.id);

  const candRow = h('div', { class: 'cand-row' });
  for (const name of cands) {
    const url = await data.panelImageURL(dir, p.id, name);
    candRow.append(h('img', {
      src: url, title: name, class: st.chosen === name ? 'chosen' : '',
      onclick: async () => {
        st.chosen = name;
        await data.savePanelState(dir, p.id, st);
        candRow.querySelectorAll('img').forEach(im => im.classList.toggle('chosen', im.title === name));
      },
    }));
  }

  const status = h('span', { class: 'status' });
  const refBoxes = cast.map(c => h('label', { class: 'inline' }, h('input', { type: 'checkbox', checked: true, dataset: { cid: c.id } }), c.name + ' 參考圖'));

  const genBtn = h('button', { class: 'primary', onclick: async () => {
    const provider = getProvider(app.meta?.providers.image);
    if (!provider) { toast('未設定生圖模型(專案頁選擇)'); return; }
    genBtn.disabled = true;
    try {
      const refDataURLs = [];
      for (const box of refBoxes) {
        const cb = box.querySelector('input');
        if (cb.checked) {
          const u = await data.charRefDataURL(cb.dataset.cid);
          if (u) refDataURLs.push(u);
        }
      }
      const imgs = await generateImages({
        provider, prompt: promptText, refDataURLs,
        count: Number($('#gen-count').value), size: $('#gen-size').value,
        onStatus: m => { status.textContent = m; },
      });
      let n = cands.length;
      for (const img of imgs) {
        n += 1;
        await store.writeBlob(data.chapterPath(dir, `panels/${p.id}/cand-${n}.png`), store.dataURLtoBlob(img));
      }
      status.textContent = `完成 ${imgs.length} 張`;
      await render();
    } catch (e) {
      status.textContent = '失敗:' + e.message;
      status.classList.add('err');
    } finally {
      genBtn.disabled = false;
    }
  } }, cands.length ? '再生成' : '生成');

  return h('div', { class: 'gen-panel' },
    h('div', { class: 'head' }, h('strong', {}, `#${p.order} `), h('span', { class: 'hint' }, p.scene.slice(0, 60))),
    h('div', { class: 'prompt-preview' }, promptText),
    h('div', { class: 'row' }, ...refBoxes, genBtn, status,
      st.chosen ? h('span', { class: 'chosen-mark' }, '已選定 ' + st.chosen) : null),
    candRow,
  );
}
