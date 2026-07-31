// 純邏輯:prompt 組裝與分鏡腳本解析。無 DOM 依賴,node 可直接匯入測試。

let seq = 0;
function newId() {
  seq += 1;
  return 'p' + Date.now().toString(36) + '-' + seq;
}

// 章節文字 → 請文字模型產分鏡腳本的 prompt
export function buildStoryboardPrompt(chapterText, characters = []) {
  const roster = characters.length
    ? '已知角色(characters 欄位請使用這些 id):\n' + characters.map(c => `- id: ${c.id}, 名字: ${c.name}, 設定: ${c.card}`).join('\n')
    : '(尚無角色庫,characters 欄位請直接填角色名字)';
  return [
    '你是漫畫分鏡師。請把下面的小說段落改編成直式條漫分鏡腳本。',
    '',
    '規則:',
    '- 只輸出一個 JSON 物件,不要任何其他文字。',
    '- sfx=效果字(擬聲/音效):只在原文明確有聲音事件時使用,text 限 1~4 字(如「轟」「叩叩」),整章最多兩三處,安靜的章節可以完全沒有。\n'
    + '- 格式: {"panels":[{"scene":"畫面場景與內容描述(給生圖模型,具體寫出環境、光線、動作)","characters":["出場角色 id"],"shot":"鏡頭(遠景/中景/特寫/俯視/仰視等)","dialogue":[{"speaker":"說話者名字或「旁白」","text":"台詞或旁白","type":"speech|thought|narration|sfx"}],"notes":"備註,可空字串"}]}',
    '- 每格一個畫面,節奏照漫畫敘事:重要時刻給特寫、轉場給遠景。',
    '- **有角色入鏡的格,scene 必須含「表情:」描述該格當下的微表情**——從劇情情緒推(驚、懼、沉思、專注、釋然、放空⋯),寫具體的臉部狀態(眼睛/眉/嘴),不要只寫「平靜」。表情是生圖成敗的關鍵欄位。',
    '- 台詞從原文取材,可精簡,不可改變劇情。',
    '- 12 到 30 格之間,依內容長度決定。',
    '',
    roster,
    '',
    '小說段落:',
    '---',
    chapterText,
    '---',
  ].join('\n');
}

// 模型回覆 → storyboard 物件(容忍 code fence 與前後雜訊)
export function parseStoryboard(text) {
  let raw = String(text).trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) raw = fence[1].trim();
  if (!raw.startsWith('{')) {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('回覆中找不到 JSON 物件');
    raw = raw.slice(start, end + 1);
  }
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch (e) {
    throw new Error('JSON 解析失敗: ' + e.message);
  }
  if (!Array.isArray(obj.panels)) throw new Error('缺少 panels 陣列');
  const panels = obj.panels.map((p, i) => ({
    id: p.id || newId(),
    order: i + 1,
    scene: String(p.scene || ''),
    characters: Array.isArray(p.characters) ? p.characters.map(String) : [],
    shot: String(p.shot || ''),
    dialogue: Array.isArray(p.dialogue)
      ? p.dialogue.map(d => ({
          speaker: String(d.speaker || ''),
          text: String(d.text || ''),
          type: ['speech', 'thought', 'narration', 'sfx'].includes(d.type) ? d.type : 'speech',
        }))
      : [],
    notes: String(p.notes || ''),
  }));
  return { panels };
}

// 角色多視角設定圖(character sheet):一張圖含多視角+表情差分,
// 之後當每格生圖的參考圖,一致性比單張立繪更穩
export function buildCharacterSheetPrompt({ style, name, card }) {
  return [
    `畫風: ${style}`,
    `角色設定圖(character reference sheet),單一張圖,白色背景,內容排版如下:`,
    `- 左側:${name} 的全身立繪三視角(正面、側面、背面),同一身高比例並排`,
    `- 右側:三個頭部特寫表情差分(平常、微笑、憤怒)`,
    `角色外觀: ${card}`,
    '所有視角必須是同一個角色,髮型、服裝、身形完全一致。',
    '重要:圖中不要出現任何文字、標籤、箭頭或浮水印。',
  ].join('\n');
}

// 單格生圖 prompt = 全域畫風 + 鏡頭 + 場景 + 出場角色設定卡 + 禁畫字
export function buildPanelPrompt({ style, panel, characterCards = [] }) {
  const cast = characterCards
    .filter(c => panel.characters.includes(c.id) || panel.characters.includes(c.name))
    .map(c => `- ${c.name}: ${c.card}`);
  return [
    `畫風: ${style}`,
    `鏡頭: ${panel.shot || '中景'}`,
    `畫面: ${panel.scene}`,
    cast.length ? '出場角色(外觀必須完全符合設定):\n' + cast.join('\n') : '',
    panel.notes ? `備註: ${panel.notes}` : '',
    '重要:圖中不要出現任何文字、對白框、狀聲字或浮水印;對白之後會用排版疊加。',
  ].filter(Boolean).join('\n');
}

// ── 匯出重繪(bake):把排版氣泡(內容+大概位置)織成 image-edit 指令,文字由模型畫進圖 ──
// 排版只傳兩件事:字的最終內容+大概位置;泡形、大小、精確擺位交給重繪端照畫面決定。
const BAKE_STYLES = {
  speech: "a clean white rounded hand-drawn speech bubble with a thin dark outline and a small tail pointing toward the speaker's mouth, containing",
  thought: 'free-floating hand-lettered inner-monologue text with NO bubble and NO box, dark ink letters with a subtle soft white halo for legibility, reading',
  narration: 'a slim rectangular narration caption box with a plain dark background and clean white lettering, containing',
  sfx: 'large expressive hand-drawn sound-effect lettering integrated into the artwork, its style, weight and distortion matched to the action in the scene (NOT bound to the base typeface), rendering',
};

function bakeRegion(x, y) {
  const hPos = x < 33 ? 'left' : x < 66 ? 'center' : 'right';
  const vPos = y < 25 ? 'top' : y < 50 ? 'upper-middle' : y < 75 ? 'lower-middle' : 'bottom';
  return `${vPos}-${hPos}`;
}

export function buildBakePrompt(bubbles, { fontRef = false } = {}) {
  const parts = [...bubbles]
    .sort((a, b) => (a.y || 0) - (b.y || 0) || (a.x || 0) - (b.x || 0))
    .map((b, i) => `(${i + 1}) in the ${bakeRegion(b.x ?? 50, b.y ?? 20)} area, ${BAKE_STYLES[b.type] || BAKE_STYLES.speech} exactly this Traditional Chinese text, ${b.type === 'sfx' ? 'perfectly legible, every character stroke correct' : 'horizontal, perfectly legible, every character stroke correct, full-width CJK punctuation'}, and nothing else: ${b.text}`);
  const inputs = fontRef
    ? 'Image 1: the finished comic panel artwork. Image 2: a lettering style sample from the same book. '
    : 'Image 1: the finished comic panel artwork. ';
  // 基準字體管對白/內心/旁白;效果字=刻意破格,不吃基準(視覺設定 13)
  const fontNote = ' LETTERING: all speech, thought and narration text uses one consistent clean rounded gothic manga typesetting'
    + (fontRef ? ', matched exactly to the typeface look, weight and rendering of the lettering in image 2' : '')
    + '; sound-effect lettering (if any) is exempt and follows the action instead.';
  return 'Use case: image-edit. Input images: ' + inputs
    + `Primary request: redraw this exact panel as a finished webtoon comic panel WITH ${parts.length} pieces of text drawn into the image as part of the comic art: `
    + parts.join(' ')
    + ' Keep the artwork, colors, faces and composition of image 1 unchanged apart from adding these text elements.'
    + fontNote
    + ' All lettering must look hand-typeset as part of the comic page, not a computer UI overlay.'
    + ' Do NOT add any corner brackets or quotation marks unless they appear in the given text. No other text anywhere.';
}

// ── 效果圖層(fx):生成可疊在格圖上的獨立效果元素 ──
// 不追求真 alpha:墨模式=純白底(疊圖時 mix-blend-mode:multiply,白=透明);
// 光模式=純黑底(mix-blend-mode:screen,黑=透明)。CSS 合成,免摳圖。
export function buildEffectPrompt({ desc, mode = 'ink', style = '' }) {
  const bg = mode === 'light'
    ? 'on a PURE SOLID BLACK (#000000) background. The element itself is bright/glowing; everything that should be transparent must be pure black (it will be composited with screen blending, black becomes invisible).'
    : 'on a PURE SOLID WHITE (#FFFFFF) background. The element itself is dark ink; everything that should be transparent must be pure white (it will be composited with multiply blending, white becomes invisible).';
  return `A single isolated comic effect element, ${bg} `
    + `The element: ${desc}. `
    + (style ? `Match the comic's overall art style: ${style}. ` : '')
    + 'Centered with generous empty margin around it, no scene, no background objects, no frame, no border. '
    + 'If the description asks for effect lettering, draw the exact given characters with every stroke correct; otherwise no text at all. No watermark.';
}
