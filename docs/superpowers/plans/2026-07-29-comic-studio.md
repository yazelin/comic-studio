# comic-studio Implementation Plan

> **For agentic workers:** 本計劃由設計者本人於同一 session 內 inline 實作（user 已授權直接做到完成），故任務保留完整介面簽名與驗證步驟，但不重複貼上全部實作碼——實作即真相，驗證以 selfcheck 與煙霧測試為準。

**Goal:** 純前端 PWA 漫畫製作 studio，小說章節 → 分鏡 → 角色一致生圖 → 氣泡排版 → 匯出自包含 PWA 漫畫電子書；部署 GitHub Pages。

**Architecture:** 無 build vanilla JS 靜態站。純邏輯（prompt 組裝、分鏡解析、匯出檔案清單）與 DOM 分離成可被 node 匯入的模組；File System Access API 落檔；provider adapter 層抽換生圖／文字 API。

**Tech Stack:** vanilla JS (ES modules)、File System Access API、Service Worker（匯出品）、node --test 式 selfcheck。

## Global Constraints

- UI 與文案全部正體中文；不用 emoji。
- 對白氣泡一律 HTML/CSS 疊字，不叫 AI 畫中文字。
- API key 預設僅存記憶體；勾「記住」才寫 localStorage（key 前綴 `comic-studio:`，附共用 origin 警告）。
- 匯出 PWA 遵守 playbook：每頁註冊 SW、全量 precache、fetch ignoreSearch。
- MIT License（林亞澤）。

## 檔案結構

```
index.html               landing（promo footer 三件套）
studio.html              工作台 shell（六站 tabs）
css/studio.css
js/store.js              FSA 專案資料夾存取（open/read/write/list）
js/providers.js          provider 設定＋三種生圖 adapter＋二種文字 adapter
js/prompt.js             純邏輯：分鏡 prompt、格 prompt 組裝、storyboard 解析驗證
js/export.js             純邏輯：由專案資料算匯出檔案清單＋各檔內容
js/ui.js                 tab 切換、共用元件
js/storyboard.js         章節匯入＋分鏡編輯 UI
js/characters.js         角色庫 UI
js/generate.js           生圖站 UI（候選/重生/選定）
js/bubbles.js            氣泡編輯 UI（拖曳定位）
reader-template/reader.html|reader.css|reader.js   匯出閱讀器模板（fetch 後填充）
tests/selfcheck.mjs      node 可跑：prompt/storyboard/export 三塊斷言
README.md  LICENSE
```

## Tasks

### Task 1: 純邏輯核心 `js/prompt.js`＋`js/export.js`＋selfcheck

**Produces:**
- `buildStoryboardPrompt(chapterText, characters) -> string`（要求模型回傳指定 JSON schema）
- `parseStoryboard(text) -> {panels:[{id,order,scene,characters,shot,dialogue:[{speaker,text,type}],notes}]}`（容忍 markdown code fence、驗欄位、給預設值；壞 JSON 丟 Error）
- `buildPanelPrompt({style, panel, characterCards}) -> string`
- `buildReaderFiles({title, chapters}) -> [{path, content}]`（chapters: `[{title, panels:[{image:'imgs/c1-p1.png', dialogue, bubbles}]}]`；回傳含 index.html/manifest/sw.js/reader.css/reader.js；sw.js precache 清單必須等於全部檔案路徑＋圖檔路徑）

**Steps:** 先寫 `tests/selfcheck.mjs` 斷言（parse 正常/фence/壞 JSON、prompt 含角色設定與風格、precache 清單=檔案清單）→ 跑失敗 → 實作 → 跑過 → commit。

### Task 2: `js/providers.js`＋`js/store.js`

**Produces:**
- `listProviders()/saveProviders(list, persist)`；preset：codex-image-service（`http://192.168.11.11:8000`）、gemini-web（`http://192.168.11.11:8070`）、openai-compatible 空白。
- `generateImages({provider, prompt, refImagesB64:[...], count}) -> [dataURL]`
  - codex: `POST {base}/v1/images/jobs` body `{prompt,size,quality,count,reference_images_base64}` bearer；輪詢 `GET /v1/images/jobs/{id}` 至 succeeded/failed；圖 URL fetch 轉 dataURL。
  - gemini-web: 無 ref→`POST /api/generate` `{prompt}`；有 ref→canvas 併圖成單張後 `POST /api/edit` `{prompt, reference_image}`；header `x-goog-api-key`；回 `{success, images:[dataURL]}`。
  - openai-compatible: `POST {base}/v1/images/generations`（b64_json）。
- `chatText({provider, prompt}) -> string`：gemini-web `/api/chat` → `.text`；openai-compatible `/v1/chat/completions`。
- store：`openProject()/readJSON/writeJSON/writeBlob/listDir/ensureDir`，專案格式照 spec。

**驗證:** adapter 的 request 組裝抽成純函式進 selfcheck（不打網路）。

### Task 3: studio UI 六站（storyboard/characters/generate/bubbles＋project/settings）

studio.html tabs：專案、設定（providers）、章節分鏡、角色、生圖、排版匯出。互動最小可用：貼文字→AI 分鏡→表格編修；角色卡 CRUD＋生成/上傳 ref；逐格生圖多候選點選選定；氣泡在圖上點擊新增、拖曳移動、雙擊改字、類型 speech/thought/narration；匯出鍵呼叫 export.js 寫 `dist/`。

**驗證:** chrome-devtools 開 localhost 煙霧測試（無 FSA 的部分用 demo 模式）＋截圖。

### Task 4: reader-template＋匯出整合

直式條漫閱讀器：章節目錄、捲動閱讀、進度存 localStorage、氣泡 CSS 疊圖。export.js fetch 模板→填資料→寫 dist/。**驗證:** selfcheck 已含清單一致；另 Playwright iPhone 13 開 dist 樣本驗行動版。

### Task 5: landing＋README＋LICENSE＋promo footer

index.html 產品介紹（工作流、BYO-key 說明、Chromium 限制、與 .11 服務接法）；套 promo-footer skill；README 完整（安裝零、直接開 Pages、provider 設定、匯出格式）。

### Task 6: 上游 CORS PR × 2

- codex-image-service：`app/main.py` 加 `CORSMiddleware`，origins 從 env `CORS_ALLOW_ORIGINS`（逗號分隔，預設 `https://yazelin.github.io,http://localhost:*` 不含萬用則列常用 localhost port）。
- gemini-web：`src/main.py` 同法，env `GEMINI_WEB_CORS_ORIGINS`。
- 各開 branch→PR，附 .11 部署步驟（docker rebuild／systemd restart），不自行 merge、不動線上服務。

### Task 7: 建 repo 部署 Pages

`gh repo create yazelin/comic-studio --public`→push→`gh api` 開 Pages（branch main root）→curl 驗 200。

## 驗收清單（給 yazelin）

1. `node tests/selfcheck.mjs` 全綠。
2. Pages 網址可開 landing 與 studio。
3. 兩個 CORS PR 連結；merge＋.11 重佈後，studio 填 .11 preset＋key 即可真打。
4. demo 專案流程截圖（見 PR/README）。
