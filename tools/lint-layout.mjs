#!/usr/bin/env node
// 排版層完稿檢查(CLI 版,給 agent 與發佈前把關)。
// 分鏡層有 lint-storyboard,這支管排版層:忘了放氣泡、氣泡拖出畫面、字級小到看不清。
// 一話一百多格時用眼睛找必漏,發佈前跑一次比較實在。
//
// 用法:node tools/lint-layout.mjs <專案資料夾> [章節dir]
// 有 error 時 exit 1(warn 不擋)。
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { lintLayout, summarize } from '../js/lint-layout.js';

const ROOT = process.argv[2];
const ONLY = process.argv[3];
if (!ROOT || !existsSync(join(ROOT, 'chapters'))) {
  console.error('用法:node tools/lint-layout.mjs <專案資料夾> [章節dir]');
  process.exit(2);
}

let errors = 0;
for (const dir of readdirSync(join(ROOT, 'chapters')).sort()) {
  if (ONLY && dir !== ONLY) continue;
  const chDir = join(ROOT, 'chapters', dir);
  const sbPath = join(chDir, 'storyboard.json');
  if (!existsSync(sbPath)) continue;

  const sb = JSON.parse(readFileSync(sbPath, 'utf8'));
  const panels = sb.panels.map(p => {
    const pj = join(chDir, 'panels', p.id, 'panel.json');
    return {
      id: p.id, order: p.order, dialogue: p.dialogue || [],
      state: existsSync(pj) ? JSON.parse(readFileSync(pj, 'utf8')) : {},
    };
  });

  const issues = lintLayout(panels);
  console.log(`\n${dir}(${panels.length} 格)— ${summarize(issues)}`);
  for (const i of issues) {
    console.log(`  ${i.level === 'error' ? '✗' : '·'} 第 ${i.order} 格  ${i.msg}`);
  }
  errors += issues.filter(i => i.level === 'error').length;
}

process.exit(errors ? 1 : 0);
