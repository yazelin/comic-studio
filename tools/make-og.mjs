#!/usr/bin/env node
// 產一張 1200x630 的社群分享圖(og:image)。
//
// 為什麼要專門產一張:匯出站原本把 og:image 指到 512 方形的 app icon,
// FB/LINE/X 會裁掉兩側或直接縮成小圖示,分享出去看不出是一本漫畫。
// 社群平台吃的是 1.91:1 大圖卡,而且 WebP 支援不一致,所以固定輸出 JPEG。
//
// 用法:node tools/make-og.mjs <來源圖> <輸出.jpg>
// 來源通常是專案根的 cover.png;沒有封面就別叫這支,讓匯出退回 icon。
// 需要 ffmpeg。
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const [src, out] = process.argv.slice(2);
if (!src || !out) {
  console.error('用法:node tools/make-og.mjs <來源圖> <輸出.jpg>');
  process.exit(2);
}
if (!existsSync(src)) {
  console.error(`找不到來源圖:${src}`);
  process.exit(1);
}

// 等比放大到蓋滿 1200x630 再置中裁切(increase+crop),不留黑邊也不變形。
// 封面多半是人物在上半部,所以裁切錨在偏上一點(y 取 1/3 而非置中),免得裁掉臉。
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', src,
  '-vf', "scale=1200:630:force_original_aspect_ratio=increase,crop=1200:630:(iw-1200)/2:(ih-630)/3",
  '-frames:v', '1', '-q:v', '3', out,
], { stdio: 'inherit' });

console.log(`og 圖已產出:${out}(1200x630 JPEG)`);
