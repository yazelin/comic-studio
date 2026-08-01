#!/usr/bin/env node
// 分鏡 linter:生圖前把 AGENTS.md 的分鏡合約當場驗掉,不要等出圖才發現。
// 治的是實際踩過的兩件事:台詞半形標點(補過兩輪)、有角色的格沒寫微表情(事後回填 37 格)。
//
// 用法:node tools/lint-storyboard.mjs <專案資料夾> [章節dir…]   全章不指定
//       node tools/lint-storyboard.mjs --self-test              自我檢查(含負控制)
// 有任何問題 → exit 1(可以直接當發佈前的 gate)。
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const TYPES = ['speech', 'thought', 'narration', 'sfx'];
const HALF = /[,.!?:;()"']/g;          // 中文台詞裡不該出現的半形標點
const NARRATOR = ['旁白', ''];          // 旁白可以沒有 speaker

// 驗一章;回傳問題陣列。cast=可用的說話者名字/ id
export function lintStoryboard(sb, { chapter = '', cast = [], world = [], cameras = {}, scenes = [] } = {}) {
  const bad = [];
  const at = p => `${chapter}/${p.id || '?'}`;
  const seen = new Set();
  for (const p of sb.panels || []) {
    if (seen.has(p.id)) bad.push(`${at(p)}:panel id 重複`);
    seen.add(p.id);
    if (!String(p.scene || '').trim()) bad.push(`${at(p)}:scene 空白`);
    for (const w of p.world || []) {
      if (world.length && !world.includes(w)) bad.push(`${at(p)}:world「${w}」在 world/ 裡找不到——場景鎖等於沒附`);
    }
    if (p.scene_id && scenes.length && !scenes.some(s => s.id === p.scene_id)) {
      bad.push(`${at(p)}:scene_id「${p.scene_id}」不在 chapter.json 的 scenes 裡`);
    }
    if (p.camera) {
      const ok = (p.world || []).some(w => (cameras[w] || []).includes(p.camera));
      if (!ok && Object.keys(cameras).length) {
        bad.push(`${at(p)}:機位「${p.camera}」不在這一格任何 world 卡的 cameras 表裡`);
      }
    }
    if ((p.characters || []).length && !/表情/.test(p.scene || '')) {
      bad.push(`${at(p)}:有角色卻沒寫「表情:」——生圖會出呆臉`);
    }
    if ((p.characters || []).length && !/動作/.test(p.scene || '')) {
      bad.push(`${at(p)}:有角色卻沒寫「動作:」——生圖會出呆站(每格同一個罰站的人)`);
    }
    if (p.continues && !seen.has(p.continues)) {
      bad.push(`${at(p)}:continues 指向「${p.continues}」,但它不在這一格前面——連戲鏈只能往回指`);
    }
    for (const d of p.dialogue || []) {
      if (!TYPES.includes(d.type)) bad.push(`${at(p)}:type「${d.type}」不是 ${TYPES.join('|')}`);
      const spk = d.speaker || '';
      if (!NARRATOR.includes(spk) && cast.length && !cast.includes(spk)) {
        bad.push(`${at(p)}:speaker「${spk}」不在角色表`);
      }
      const hits = String(d.text || '').match(HALF);
      if (hits) bad.push(`${at(p)}:台詞有半形標點 ${[...new Set(hits)].join(' ')} —— 對外一律全形`);
    }
  }
  return bad;
}

function selfTest() {
  const cast = ['陸修'];
  const good = { panels: [
    { id: 'p1', scene: '中景。表情:眼睛微張,嘴抿著。動作:重心在左腳,右手垂著,視線往前。', characters: ['陸修'], dialogue: [{ speaker: '陸修', text: '這條路是走出來的。', type: 'speech' }] },
    { id: 'p2', scene: '空景。一條車轍路。', characters: [], dialogue: [{ speaker: '', text: '路的意思是有人。', type: 'narration' }] },
  ] };
  const badWorld = lintStoryboard({ panels: [{ id: 'p1', scene: '空景。', characters: [], world: ['no_such_place'], dialogue: [] }] }, { world: ['node_guild_hall'] });
  const bad = { panels: [
    { id: 'p1', scene: '中景,他站著。', characters: ['陸修'], dialogue: [{ speaker: '守衛', text: '來歷,文件?', type: 'talk' }] },
    { id: 'p1', scene: '', characters: [], dialogue: [] },
  ] };
  const clean = lintStoryboard(good, { cast });
  const dirty = lintStoryboard(bad, { cast });
  const has = re => dirty.some(m => re.test(m));
  const badChain = lintStoryboard({ panels: [{ id: 'p1', scene: '空景。', characters: [], continues: 'p9', dialogue: [] }] });
  const ok = clean.length === 0 && badChain.some(m => /連戲鏈/.test(m))
    && has(/動作/) && has(/表情/) && has(/半形/) && has(/type/) && has(/不在角色表/) && has(/重複/) && has(/scene 空白/)
    && badWorld.some(m => /world/.test(m));
  console.log(clean.length === 0 ? '負控制通過:乾淨的分鏡 0 問題' : `負控制失敗:${clean.join(' / ')}`);
  console.log(`召回:壞分鏡抓到 ${dirty.length} 條 —— ${dirty.join(' / ')}`);
  if (!ok) { console.error('self-test 失敗'); process.exit(1); }
  console.log('self-test 全綠');
}

if (process.argv[2] === '--self-test') { selfTest(); process.exit(0); }

const root = process.argv[2];
if (!root) { console.error('用法:node tools/lint-storyboard.mjs <專案資料夾> [章節dir…]'); process.exit(2); }

const cast = [];
const charRoot = join(root, 'characters');
if (existsSync(charRoot)) {
  for (const id of readdirSync(charRoot)) {
    const cj = join(charRoot, id, 'card.json');
    if (!existsSync(cj)) continue;
    const card = JSON.parse(readFileSync(cj, 'utf8'));
    cast.push(card.name || id, id);
  }
}

const world = [];
const cameras = {};
const worldRoot = join(root, 'world');
if (existsSync(worldRoot)) {
  for (const id of readdirSync(worldRoot)) {
    const cj = join(worldRoot, id, 'card.json');
    if (!existsSync(cj)) continue;
    world.push(id);
    cameras[id] = Object.keys(JSON.parse(readFileSync(cj, 'utf8')).cameras || {});
  }
}

const only = process.argv.slice(3);
const chDirs = readdirSync(join(root, 'chapters')).sort().filter(d => !only.length || only.includes(d));
let total = 0;
for (const dir of chDirs) {
  const sbPath = join(root, 'chapters', dir, 'storyboard.json');
  if (!existsSync(sbPath)) continue;
  // 一次性說話者(守衛、考官、賓客…)不開角色卡,在 chapter.json 的 extras 宣告——
  // 宣告過才算數,才擋得住把「守衛」打成「衛守」這種沒人會發現的錯字
  const cj = join(root, 'chapters', dir, 'chapter.json');
  const extras = existsSync(cj) ? (JSON.parse(readFileSync(cj, 'utf8')).extras || []) : [];
  const chJson = existsSync(cj) ? JSON.parse(readFileSync(cj, 'utf8')) : {};
  const scenes = chJson.scenes || [];
  const sbData = JSON.parse(readFileSync(sbPath, 'utf8'));
  const ids = new Set((sbData.panels || []).map(p => p.id));
  for (const sc of scenes) {
    for (const c of sc.changes || []) {
      if (!ids.has(c.at)) console.log(`  ⚠ 場次 ${sc.id} 的 changes 指到不存在的格「${c.at}」`);
    }
  }
  const bad = lintStoryboard(sbData, { chapter: dir, cast: [...cast, ...extras], world, cameras, scenes });
  total += bad.length;
  console.log(bad.length ? `\n[${dir}] ${bad.length} 條:\n` + bad.map(b => '  ' + b).join('\n') : `[${dir}] 通過`);
}
console.log(total ? `\n共 ${total} 條要修` : '\n全部通過');
process.exit(total ? 1 : 0);
