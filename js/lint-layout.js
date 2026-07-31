// 排版層的完稿檢查(純邏輯,node 與瀏覽器共用)。
//
// 分鏡層有 lint-storyboard 擋全形標點與微表情;排版層一直沒有對應的東西。
// 一話一百多格時,用眼睛找「哪格忘了放氣泡」「哪顆泡拖到畫面外」必漏。
// 這裡只放**客觀錯誤**,不管美感:能用規則判定的才進來。

export const LINT_LIMITS = {
  edge: 3,        // 氣泡中心離邊界少於 3% 就算拖出去了(泡是以中心定位,泡體會再往外長)
  minFs: 2.2,     // 手動字級下限(cqw)。匯出是 clamp(13px, 3.4cqw, 22px),低於這個手機上糊掉
  maxW: 78,       // 單顆泡的最大寬度%:再寬就把整格畫面蓋掉了
};

// panels: [{ id, order, dialogue:[{text,type}], state:{chosen, bubbles:[...]} }]
// 回傳 [{ level:'error'|'warn', order, id, msg }],已依格號排序。
export function lintLayout(panels, limits = LINT_LIMITS) {
  const out = [];
  for (const p of panels) {
    const add = (level, msg) => out.push({ level, order: p.order, id: p.id, msg });
    const st = p.state || {};
    const bubbles = st.bubbles || [];
    const dialogue = p.dialogue || [];

    if (!st.chosen) { add('error', '還沒選定格圖'); continue; }  // 沒圖就別再挑氣泡的毛病

    if (dialogue.length && !bubbles.length) {
      add('error', `分鏡有 ${dialogue.length} 句台詞,但一顆氣泡都沒有`);
    } else if (dialogue.length && bubbles.length < dialogue.length) {
      add('warn', `分鏡 ${dialogue.length} 句、氣泡只有 ${bubbles.length} 顆`);
    }

    bubbles.forEach((b, i) => {
      const n = `第 ${i + 1} 顆氣泡`;
      if (!String(b.text || '').trim()) add('error', `${n}是空的`);
      if (String(b.text || '').trim() === '雙擊編輯文字') add('error', `${n}還是預設字,忘了改`);
      const e = limits.edge;
      if (b.x < e || b.x > 100 - e || b.y < e || b.y > 100 - e) {
        add('warn', `${n}拖到畫面外了(${Math.round(b.x)}, ${Math.round(b.y)})`);
      }
      if (b.fs != null && b.fs < limits.minFs) {
        add('warn', `${n}字級 ${b.fs} 太小,手機上會看不清(建議留空走自動)`);
      }
      if (b.w != null && b.w > limits.maxW) {
        add('warn', `${n}寬度 ${b.w}% 會蓋掉大半格畫面`);
      }
    });
  }
  return out.sort((a, b) => a.order - b.order);
}

export function summarize(issues) {
  const e = issues.filter(i => i.level === 'error').length;
  const w = issues.length - e;
  return e || w ? `${e} 個錯誤、${w} 個提醒` : '沒有問題';
}
