// 純邏輯:從章節網頁 HTML 抽出標題與正文(regex 字串處理,node 可測)。
// 適用「正文放在 <p> 段落」的閱讀頁(如 token-unlimited);
// 有 <main> 就只取 <main> 內,避免抓到頁面 UI 文字。

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

export function extractChapterFromHTML(html) {
  const title = decodeEntities((html.match(/<title>([\s\S]*?)<\/title>/i) || [, ''])[1].trim());
  let scope = html;
  const main = html.match(/<main[\s\S]*?>([\s\S]*?)<\/main>/i);
  if (main) scope = main[1];
  scope = scope.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  const paras = [];
  for (const m of scope.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    const text = decodeEntities(m[1].replace(/<[^>]+>/g, '')).trim();
    if (text) paras.push(text);
  }
  if (!paras.length) throw new Error('抓不到正文段落(<p>)——這頁可能不是文章式的閱讀頁');
  return { title, text: paras.join('\n\n') };
}
