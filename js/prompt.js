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
    '- 格式: {"panels":[{"scene":"畫面場景與內容描述(給生圖模型,具體寫出環境、光線、動作)","characters":["出場角色 id"],"shot":"鏡頭(遠景/中景/特寫/俯視/仰視等)","dialogue":[{"speaker":"說話者名字或「旁白」","text":"台詞或旁白","type":"speech|thought|narration"}],"notes":"備註,可空字串"}]}',
    '- 每格一個畫面,節奏照漫畫敘事:重要時刻給特寫、轉場給遠景。',
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
          type: ['speech', 'thought', 'narration'].includes(d.type) ? d.type : 'speech',
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
