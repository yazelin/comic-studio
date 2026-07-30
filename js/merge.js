// 純邏輯:角色去重合併。AI 分鏡常把同一人寫成兩個名字(「亞澤」「男子」),
// 把 storyboard 內所有 from 的引用改成 to,並去重。回傳改了幾格。
export function applyCharacterMerge(storyboard, fromKeys, toId) {
  const from = new Set(fromKeys);
  let touched = 0;
  for (const p of storyboard.panels) {
    if (!Array.isArray(p.characters)) continue;
    if (!p.characters.some(c => from.has(c))) continue;
    const next = [];
    for (const c of p.characters) {
      const v = from.has(c) ? toId : c;
      if (!next.includes(v)) next.push(v);
    }
    p.characters = next;
    touched += 1;
  }
  return touched;
}
