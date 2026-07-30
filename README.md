# comic-studio — AI 漫畫製作工作台

把小說做成漫畫的**純前端**工作台：章節文字 → AI 分鏡 → 角色一致生圖 → 對白氣泡排版 → 整格重繪把文字畫進圖 → 匯出一本可安裝、可離線的 PWA 漫畫電子書。

線上使用：<https://yazelin.github.io/comic-studio/>

- 沒有後端、沒有帳號。專案資料全部存在你自己電腦的資料夾（File System Access API，需 Chrome／Edge 等 Chromium 瀏覽器）。
- 模型完全可替換：自帶 baseurl／model／API key。
- 匯出品是自包含的靜態閱讀站，丟到任何靜態空間（GitHub Pages、NAS、隨身碟）都能看。

## 工作流

1. **專案**：開啟（或新建）一個本機資料夾當專案，設定作品標題與全域畫風。
2. **章節分鏡**：貼上章節原文，或「從網址匯入」——貼一個文章式閱讀頁的網址（正文在 `<p>` 段落），自動建章節、抓標題、抽正文（同網域必可；跨站需對方允許 CORS）。「AI 產生分鏡」把文字切成分鏡腳本（場景、鏡頭、出場角色、台詞——含對白/內心/旁白/**效果字**四型；效果字只在原文有聲音事件時少量出現），逐格可手動編修。
3. **角色庫**：每個角色一張文字設定卡＋一張設定參考圖（AI 生成或上傳）。之後每格生圖都會自動把設定卡拼進 prompt、參考圖逐格可勾選附帶——這是角色長相一致的關鍵。
4. **生圖**：逐格生成、多候選、點選選定；不滿意就再生成。
5. **排版**：對白氣泡是 HTML 文字疊在圖上（點擊新增、拖曳移動、雙擊改字），改字零成本。排版只決定兩件事：**字的最終內容＋大概位置**。
6. **匯出**：**預設走 CSS 疊字**——三層聲音的樣式（對白＝白泡、內心＝無框浮字＋白光暈、旁白＝淡黑底正黑體）由閱讀器 CSS 統一渲染，字體天生一致、改字零成本。**只有特殊表現格才用「整格重繪」**（效果字、文字要跟畫互動的格）：拿「選定圖＋排版文字」請生圖模型 image-edit 把文字畫進圖，並自動帶「字體錨」維持基準字感。匯出電子書時：有重繪圖的格用重繪圖，其餘用選定圖＋CSS 疊字。烙完逐格檢查錯字，不滿意單格重繪；成品存進章節的 `匯出/`。「匯出電子書」時已重繪的格用重繪圖，沒重繪的退回疊字，寫進 `dist/`。

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
project.json          標題、全域畫風、預設模型（不含 key）
characters/<id>/      card.json 文字設定卡＋ref.png 設定圖
chapters/<n>/
  chapter.json        章節標題
  source.md           原文
  storyboard.json     分鏡腳本
  panels/<格id>/      cand-*.png 候選圖＋panel.json（選定與氣泡）
  匯出/<格id>.png     整格重繪成品（文字已畫進圖；可整批重生）
dist/                 匯出的 PWA 電子書（產物，可整個重生）
```

一切都是普通檔案，想 git 版控、備份、換機都沒有障礙。

## 匯出品

`dist/` 是一個自包含 PWA：直式條漫閱讀器（章節目錄、閱讀進度記憶）、`manifest.json`、`sw.js` 全量 precache。放上靜態空間後可安裝到手機桌面、離線閱讀。

## 開發

無 build。改完跑：

```bash
node tests/selfcheck.mjs   # 純邏輯自我檢查（分鏡解析、prompt 組裝、匯出清單一致性）
python3 -m http.server     # 本機開 studio
```

## License

MIT © 林亞澤
