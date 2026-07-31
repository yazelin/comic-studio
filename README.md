# comic-studio — AI 漫畫製作工作台

把小說做成漫畫的**純前端**工作台：章節文字 → AI 分鏡 → 角色一致生圖 → 對白氣泡排版 → 整格重繪把文字畫進圖 → 匯出一本可安裝、可離線的 PWA 漫畫電子書。

線上使用：<https://yazelin.github.io/comic-studio/>

- 沒有後端、沒有帳號。專案資料全部存在你自己電腦的資料夾（File System Access API，需 Chrome／Edge 等 Chromium 瀏覽器）。
- 模型完全可替換：自帶 baseurl／model／API key。
- 匯出品是自包含的靜態閱讀站，丟到任何靜態空間（GitHub Pages、NAS、隨身碟）都能看。

## 工作流

1. **專案**：開啟（或新建）一個本機資料夾當專案，設定作品標題與全域畫風。
2. **章節分鏡**：貼上章節原文，或「從網址匯入」——貼一個文章式閱讀頁的網址（正文在 `<p>` 段落），自動建章節、抓標題、抽正文（同網域必可；跨站需對方允許 CORS）。「AI 產生分鏡」把文字切成分鏡腳本（場景、鏡頭、出場角色、台詞——含對白/內心/旁白/**效果字**四型；效果字只在原文有聲音事件時少量出現），逐格可手動編修。
3. **角色庫**：每個角色一張文字設定卡＋**三張設定表**——立繪（長相服裝）、**表情集**（九宮格情緒）、**動作集**（九宮格全身動態），後兩張以立繪為參考圖生成，同一張臉只換情緒／體態。生圖時立繪必附，該格分鏡寫了表情就附表情集、是動作鏡頭就附動作集（總數上限 4 張，再多特徵會互相污染）。
   設定卡另有「**絕對不可出現**」欄：模型最愛自己補帽子、眼鏡、現代服裝，把「沒有什麼」寫死才擋得住。
   〔為什麼要三張：只給一張中性立繪，每一格的臉都會趨中——連載讀者第一個抱怨就是「主角表情太少」。〕
4. **生圖**：逐格生成、多候選、點選選定；不滿意就再生成。
5. **排版（三層合成）**：底圖（不動）→ **效果層** → **字層**。
   - 字層：對白氣泡是 HTML 文字疊在圖上（點擊新增、拖曳移動、雙擊改字），改字零成本；三層聲音＋效果字四型；寬度與字級可留自動（隨格寬縮放）或手動指定（單位＝格寬 %，跨裝置等比）；每顆對白泡各自選尾巴指向（上下左右＋四個斜角共八向，預設朝下，也可關掉）——同一格裡的說話者在不同位置，方向本來就該一顆一顆挑。工作台的氣泡跟匯出站用同一支字型、同一組內距行高字距，所見即所得。
   - 效果層：CSS 做不出的表現（畫出來的擬聲字、光暈、煙）用「＋效果層」生成獨立圖檔疊上去——墨模式（白底黑墨，疊圖 multiply 白色消失）、光模式（黑底發光，screen 黑色消失），免摳圖、可拖曳縮放旋轉、右鍵刪除；也可上傳自備透明 PNG。底圖永遠不被破壞。
6. **匯出（出版級 PWA 站）**：產出的不是單頁閱讀器，是完整站——首頁（封面 hero＋簡介＋最新話＋繼續閱讀＋章節列表＋角色區）、每章獨立頁（canonical/og、上一章下一章、頂欄自動隱現、進度條與進度記憶）、角色頁（自動從角色庫生成）、manifest＋SHELL/ASSET 兩層離線快取（**版本＝內容雜湊，自動 bump**）、sitemap 與 robots（設定 `site.url` 時）。出版設定放 `project.json` 的 `site` 欄：`{url, description, author, links:{github,facebook,coffee,novel}, storageKey, theme, colors}`；**出版範本**（`site.theme`，也可在「專案」頁下拉選）一個名字帶一整套色票——`paper` 暖紙（預設）、`token-unlimited` 土金、`workbench` 製版桌、`midnight` 深夜；`site.colors` 可在範本之上逐項覆蓋，範本名打錯就退回暖紙。範本管站台底色、文字色、格間色、氣泡與旁白條的顏色，以及面色（續讀鈕、章節列表與角色卡的 hover）與副 accent（連結 hover）——深色範本沒有這兩個就會整片黏在一起、滑過去也沒反應；`accent` 全站只用在閱讀進度條一處，挑色時記得它代表「讀掉多少」。專案根放 `cover.png` 即成為首頁封面與 app icon。**預設走 CSS 疊字**——三層聲音的樣式（對白＝白泡＋八向可選的尾巴、內心＝無框浮字＋白光暈、旁白＝淡黑底正黑體）由閱讀器 CSS 統一渲染，字體天生一致、改字零成本。**字型自架**：`dist/fonts/comic-tc.woff2`（Noto Sans TC 變體字重，子集化到常用字，OFL 1.1）隨站一起匯出並進離線快取，讀者裝置有沒有裝中文字型都長一樣；常用字以外落回系統字型。要重新產字型檔跑 `python3 tools/build-font.py`（需 fontTools＋brotli）。**只有特殊表現格才用「整格重繪」**（效果字、文字要跟畫互動的格）：拿「選定圖＋排版文字」請生圖模型 image-edit 把文字畫進圖，並自動帶「字體錨」維持基準字感。匯出電子書時：有重繪圖的格用重繪圖，其餘用選定圖＋CSS 疊字。烙完逐格檢查錯字，不滿意單格重繪；成品存進章節的 `匯出/`。「匯出電子書」時已重繪的格用重繪圖，沒重繪的退回疊字，寫進 `dist/`。

## 模型設定（BYO-key）

「模型設定」頁每一列是一個端點，支援三種類型：

| 類型 | 說明 | 生圖 | 文字（分鏡） |
|---|---|---|---|
| `openai-compatible` | OpenAI 官方或任何相容閘道 | `/v1/images/generations` | `/v1/chat/completions` |
| `codex-image-service` | [自架的 Codex CLI 圖像服務](https://github.com/yazelin/codex-image-service) | 是（多參考圖、async job） | 否 |
| `gemini-web` | [自架的 Gemini 網頁自動化服務](https://github.com/yazelin/gemini-web) | 是（單參考圖；多張會自動併圖） | 是 |

- API key **預設只留在記憶體**，關分頁即消失；勾「記住」才寫入瀏覽器儲存空間。共用電腦請勿勾選。
- **推薦：key 放專案資料夾**。在專案根目錄放 `keys.json`（等同 .env 的角色），開專案時自動帶入、只進記憶體，不碰瀏覽器儲存空間：

  ```json
  { "codex-image-service": "你的key", "gemini-web": "你的key" }
  ```

  鍵名＝「模型設定」頁的 provider 名稱。專案資料夾若有 git 版控，請把 `keys.json` 加進 `.gitignore`。
- 所有請求由你的瀏覽器直接打到你填的端點，本站沒有伺服器、不經手任何資料。
- 自架服務要在服務端允許本站來源的 CORS（兩個服務的新版都有 `CORS_ALLOW_ORIGINS` 類環境變數；見各自 README）。

## 專案資料夾格式

```
project.json          標題、全域畫風、site 出版設定、預設模型（不含 key）
cover.png             封面（可選；首頁 hero＋icon 來源）
characters/<id>/      card.json 文字設定卡＋ref.png 設定圖
chapters/<n>/
  chapter.json        章節標題
  source.md           原文
  storyboard.json     分鏡腳本
  panels/<格id>/      cand-*.png 候選圖＋fx-*.png 效果層＋panel.json（選定、氣泡、效果層）
  匯出/<格id>.png     整格重繪成品（文字已畫進圖；可整批重生）
dist/                 匯出的 PWA 電子書（產物，可整個重生）
```

一切都是普通檔案，想 git 版控、備份、換機都沒有障礙。AI agent 的操作合約見 [`AGENTS.md`](AGENTS.md)。

## 上線（兩條路）

- **沒有 agent**：UI 匯出 `dist/` 後，把整個資料夾拖上任何靜態空間（GitHub 網頁上傳、Netlify Drop、NAS）就是成品站——UI 的完成度到 dist 為止是刻意的邊界，瀏覽器出不了 git push。
- **有 agent／CLI**：參考消費 repo 的 `發佈.sh` 模式——node 跑匯出（可加 webp 轉檔與章節篩選）→ 同步到站台 repo → push。

## 匯出品

`dist/` 是一個自包含 PWA：直式條漫閱讀器（章節目錄、閱讀進度記憶）、`manifest.json`、`sw.js` 全量 precache。放上靜態空間後可安裝到手機桌面、離線閱讀。

## 這個工具本身也是 PWA

可安裝到桌面（`manifest.json` + 圖示），Service Worker 只快取**工作台的殼**——斷線時 UI 還開得起來、本機專案資料夾照樣讀寫，但**生圖一定要連線**：SW 不碰任何 POST 與跨網域請求，不會讓人誤以為離線能生圖。殼走 network-first，所以工具更新馬上吃得到，離線才回退快取。

## 開發

無 build。改完跑：

```bash
node tests/selfcheck.mjs   # 純邏輯自我檢查（分鏡解析、prompt 組裝、匯出清單一致性）
python3 -m http.server     # 本機開 studio
```

## License

MIT © 林亞澤
