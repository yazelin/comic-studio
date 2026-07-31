# AGENTS.md — 給 AI agent 的操作合約

comic-studio 的定位:**人審人調的工作台+可執行的輸出標準**。人用 UI 看與調;agent 用檔案系統直接操作專案資料夾。輸出標準不是文件,是 `js/export.js` 的 `buildReaderFiles`——UI 按鈕、node 腳本、任何 agent 呼叫它,產出同一份出版級 PWA 站。**不要自己發明匯出格式。**

## 專案資料夾(唯一資料介面)

見 README「專案資料夾格式」。重點:
- `project.json`:`title`、`style`(全域畫風)、`site`(出版設定:url/description/author/links{github,facebook,coffee,novel}/storageKey)
- `characters/<id>/card.json{id,name,card,bio,must_not}` + **三張設定表** `ref.png`(立繪)/`expr.png`(表情集)/`pose.png`(動作集):card=英文生圖文字卡、bio=讀者向中文介紹(角色頁用)、must_not=不該出現的東西(模型會自己補帽子眼鏡現代服裝)
  - 生圖時立繪必附;該格 scene 有「表情」就附表情集,動作鏡頭附動作集,**參考圖總數上限 4 張**
  - 表情/動作集一定要以立繪當參考圖生成,否則等於重抽一個人
- `chapters/<n>/chapter.json`:`title`(**真章名**,話數≠章號:第 1 話可能叫「序章」)、`extras`(本章一次性說話者:守衛、考官、賓客…不開角色卡,但要宣告,linter 只認宣告過的名字)
- `characters/<id>/card.json` 的 `hidden: true`=**伏筆角色**:照樣當生圖角色(附參考圖、進 cast),但不上公開角色頁——臉還不能給讀者的人用這個
- `world/<id>/card.json` + `ref.png`=**世界風土庫**(場景、道具、風土素材:公會大廳、告示板、貨幣、文字筆跡、街市攤位…)。跟角色庫同形狀,分鏡用 `panel.world: ["node_guild_hall"]` 指名,生圖時當這一格的**場景鎖**附上去——沒有它,同一個大廳每格都會重抽一個樣子
  - 參考圖優先序:**場景鎖 → 每個出場角色的立繪(保底)→ 表情/動作**;上限 codex 8 張(該 API 無張數限制)、其餘 4 張(gemini-web 只吃單張,多張會被併小)
  - **群像表不可以直接當 ref**:一張圖裡有別人,生圖就會把別人的臉帶進來。群像只是產線中間物,一定要裁成單人 `ref.png`
- `chapters/<n>/storyboard.json`:分鏡=正本。**有角色的格,scene 必含「表情:」**(眼/眉/嘴的具體狀態)——表情缺席=生圖出呆臉,是分鏡層的責任
- `chapters/<n>/panels/<pid>/`:`cand-N.png` 候選、`fx-N.png` 效果層、`panel.json{chosen,bubbles,effects}`
- `panel.json` 的 bubbles=**文字正本**(人在排版層改過的字以此為準,別回頭讀 storyboard 蓋掉)
- `cover.png`(專案根,可選)=首頁 hero 與 icon 來源

## 產線(agent 的標準步驟)

1. **分鏡**:正文→storyboard.json(格數/鏡頭/台詞含四型 speech|thought|narration|sfx/微表情)。台詞一律**全形標點**。
   - 開生圖前跑 `node tools/lint-storyboard.mjs <專案資料夾> [章節dir]`(全形標點/微表情/四型/speaker 在角色表/id 不重複),有問題 exit 1。**這一關在分鏡層修最便宜**——半形標點補過兩輪、微表情事後回填 37 格,都是漏掉這關的帳。
2. **生圖**:逐格 image provider(參考圖:角色卡 ref 必附;鏈式參考時**首圖先驗過再開鏈**——第一張的風格會傳染整條線;暗景要明令「NOT photorealistic」)。存 `cand-N.png`,不覆蓋舊候選。
3. **人排版**(UI):這一步是人的;agent 不要動 bubbles 內容。
4. **驗收**:逐格驗(角色一致/風格一致/表情到位/世界觀無破格——現代物件=紅線)。
5. **匯出**:呼叫 `buildReaderFiles`(或跑消費 repo 的 node 匯出腳本)。**逐項達標,不要輸出到一半宣稱完成**:多頁站/每章 SEO/角色頁/兩層 SW 快取(版本=內容雜湊,免手動 bump)/sitemap+robots(有 site.url 時)。站台配色走 `site.theme` 範本(`paper`/`token-unlimited`/`workbench`/`midnight`),要微調用 `site.colors` 逐項覆蓋,**不要自己去改 `SITE_CSS` 的顏色**——那會改掉所有作品。**字型要自己複製**:`buildReaderFiles` 只產文字檔,`assets/fonts/comic-tc.woff2` 要複製到 `dist/fonts/`;複製不了就傳 `fontPath: null`,否則 SHELL 快取 addAll 會整包失敗、離線直接壞掉。
6. **發佈**:git push 到站台 repo(參考消費 repo 的 `發佈.sh` 模式:匯出→同步→BMC 泡效果→push)。UI 做不到 push,這一步永遠在 CLI。

## 驗收底線

`node tests/selfcheck.mjs` 全綠=輸出標準通過。改 export/prompt 邏輯必先跑它。
