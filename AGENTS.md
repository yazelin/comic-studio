# AGENTS.md — 給 AI agent 的操作合約

comic-studio 的定位:**人審人調的工作台+可執行的輸出標準**。人用 UI 看與調;agent 用檔案系統直接操作專案資料夾。輸出標準不是文件,是 `js/export.js` 的 `buildReaderFiles`——UI 按鈕、node 腳本、任何 agent 呼叫它,產出同一份出版級 PWA 站。**不要自己發明匯出格式。**

## 專案資料夾(唯一資料介面)

見 README「專案資料夾格式」。重點:
- `project.json`:`title`、`style`(全域畫風)、`site`(出版設定:url/description/author/links{github,facebook,coffee,novel}/storageKey)
- `characters/<id>/card.json{id,name,card}+ref.png`:card=英文生圖文字卡;ref 圖=角色一致性的錨,**生任何含該角色的格都要附**
- `chapters/<n>/storyboard.json`:分鏡=正本。**有角色的格,scene 必含「表情:」**(眼/眉/嘴的具體狀態)——表情缺席=生圖出呆臉,是分鏡層的責任
- `chapters/<n>/panels/<pid>/`:`cand-N.png` 候選、`fx-N.png` 效果層、`panel.json{chosen,bubbles,effects}`
- `panel.json` 的 bubbles=**文字正本**(人在排版層改過的字以此為準,別回頭讀 storyboard 蓋掉)
- `cover.png`(專案根,可選)=首頁 hero 與 icon 來源

## 產線(agent 的標準步驟)

1. **分鏡**:正文→storyboard.json(格數/鏡頭/台詞含四型 speech|thought|narration|sfx/微表情)。台詞一律**全形標點**。
2. **生圖**:逐格 image provider(參考圖:角色卡 ref 必附;鏈式參考時**首圖先驗過再開鏈**——第一張的風格會傳染整條線;暗景要明令「NOT photorealistic」)。存 `cand-N.png`,不覆蓋舊候選。
3. **人排版**(UI):這一步是人的;agent 不要動 bubbles 內容。
4. **驗收**:逐格驗(角色一致/風格一致/表情到位/世界觀無破格——現代物件=紅線)。
5. **匯出**:呼叫 `buildReaderFiles`(或跑消費 repo 的 node 匯出腳本)。**逐項達標,不要輸出到一半宣稱完成**:多頁站/每章 SEO/角色頁/兩層 SW 快取(版本=內容雜湊,免手動 bump)/sitemap+robots(有 site.url 時)。
6. **發佈**:git push 到站台 repo(參考消費 repo 的 `發佈.sh` 模式:匯出→同步→BMC 泡效果→push)。UI 做不到 push,這一步永遠在 CLI。

## 驗收底線

`node tests/selfcheck.mjs` 全綠=輸出標準通過。改 export/prompt 邏輯必先跑它。
