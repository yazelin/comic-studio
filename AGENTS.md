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
  - `world/<id>/plan.png` + `card.json` 的 `cameras`={代號:描述} = **平面配置圖與機位表**。一個空間只有一張正視參考圖時,從別的角度拍的格會把家具與門窗重新擺一次——同一場戲三十格,每格的窗戶都在不同的牆上。平面圖把「有什麼、彼此的相對位置」一次講完;分鏡每格填 `camera: "A"` 指名從哪個機位拍,生圖才會把平面圖附上去(沒填機位不附——模型不知道站在哪裡看,平面圖只會變成雜訊)
  - 參考圖優先序:**承前格 → 場景鎖(+平面圖)→ 每個出場角色的立繪(保底)→ 表情/動作**;上限 codex 8 張(該 API 無張數限制)、其餘 4 張(gemini-web 只吃單張,多張會被併小)
  - **群像表不可以直接當 ref**:一張圖裡有別人,生圖就會把別人的臉帶進來。群像只是產線中間物,一定要裁成單人 `ref.png`
- `chapters/<n>/storyboard.json`:分鏡=正本。**有角色的格,scene 必含「表情:」與「動作:」**——表情缺席=呆臉,動作缺席=呆站(每格同一個罰站的人),兩個都是分鏡層的責任
  - 「動作:」寫重心在哪隻腳、手在做什麼、視線去哪、跟環境的接觸點;**要連戲**:上一格結束的姿勢是這一格的起點
  - **動作欄不准寫比喻**。scene 會被逐字餵給生圖模型,比喻裡的名詞會被當成道具畫出來——實測「像把一份報告闔上」生出木桌加一疊紙的室內辦公場景。公文、表單、說明書、規格書這類「畫得出來的名詞」一律不要進動作欄
  - **近景與特寫也要寫環境**。只寫人不寫背景時,模型會自己補一面室內牆;有場景鎖(`world`)就掛上去,沒有就在 scene 裡寫死背景是什麼
  - 承接前一格的格填 `continues: "<前一格 id>"`,生圖時前一格的成品會當第一張參考圖。**承接的是機位、場景、光線**;人物以本格的 `characters` 為準——同一個人才承接姿勢,換人的定鏡重複格(考生一個一個上場)不會把上一格那個人的臉帶過來
- `style-anchor.png`(專案根,可選)=**畫風錨**。參考圖掛零的格(空鏡、微距、地面、燒掉的林子)沒有任何東西壓著畫風,一路往寫實照片跑——放一張已完成、風格對的圖在這裡,那種格會自動附上它。**不要放有角色的圖**(角色會被帶進空鏡),也不要放有保留色的圖(例如艾可的白袍)
- `project.json` 的 `rules`(陣列,可選)=**全域紅線**,每一格 prompt 都會帶上(例:群眾不准出現兩個一樣的人、保留色紀律)
- `chapters/<n>/panels/<pid>/`:`cand-N.png` 候選、`fx-N.png` 效果層、`panel.json{chosen,bubbles,effects}`
- `panel.json` 的 bubbles=**文字正本**(人在排版層改過的字以此為準,別回頭讀 storyboard 蓋掉)
- `cover.png`(專案根,可選)=首頁 hero 與 icon 來源

## 產線(agent 的標準步驟)

1. **分鏡**:正文→storyboard.json(格數/鏡頭/台詞含四型 speech|thought|narration|sfx/微表情)。台詞一律**全形標點**。
   - 開生圖前跑 `node tools/lint-storyboard.mjs <專案資料夾> [章節dir]`(全形標點/微表情/四型/speaker 在角色表/id 不重複),有問題 exit 1。**這一關在分鏡層修最便宜**——半形標點補過兩輪、微表情事後回填 37 格,都是漏掉這關的帳。
2. **生圖**:逐格 image provider(參考圖:角色卡 ref 必附;鏈式參考時**首圖先驗過再開鏈**——第一張的風格會傳染整條線;暗景要明令「NOT photorealistic」)。存 `cand-N.png`,不覆蓋舊候選。
3. **人排版**(UI):這一步是人的;agent 不要動 bubbles 內容。**但排完要跑 `node tools/lint-layout.mjs <專案資料夾> [章節dir]`**(忘了放氣泡/拖出畫面/空泡/還留預設字/字級過小),有 error exit 1。一話上百格用眼睛找必漏——跟分鏡層那關同一個道理,在這裡修最便宜。
4. **驗收**:逐格驗(角色一致/風格一致/表情到位/世界觀無破格——現代物件=紅線)。
5. **匯出**:呼叫 `buildReaderFiles`(或跑消費 repo 的 node 匯出腳本)。**逐項達標,不要輸出到一半宣稱完成**:多頁站/每章 SEO/角色頁/兩層 SW 快取(版本=內容雜湊,免手動 bump)/sitemap+robots(有 site.url 時)。站台配色走 `site.theme` 範本(`paper`/`token-unlimited`/`workbench`/`midnight`),要微調用 `site.colors` 逐項覆蓋,**不要自己去改 `SITE_CSS` 的顏色**——那會改掉所有作品。**社群分享圖要自己產**:封面在時跑 `node tools/make-og.mjs <cover> dist/og.jpg`(1200x630 JPEG)並傳 `ogPath: 'og.jpg'`;不傳就退回 512 方形 icon,分享出去會被裁。**字型要自己複製**:`buildReaderFiles` 只產文字檔,`assets/fonts/comic-tc.woff2` 要複製到 `dist/fonts/`;複製不了就傳 `fontPath: null`,否則 SHELL 快取 addAll 會整包失敗、離線直接壞掉。
6. **發佈**:git push 到站台 repo(參考消費 repo 的 `發佈.sh` 模式:匯出→同步→BMC 泡效果→push)。UI 做不到 push,這一步永遠在 CLI。

## 驗收底線

`node tests/selfcheck.mjs` 全綠=輸出標準通過。改 export/prompt 邏輯必先跑它。
