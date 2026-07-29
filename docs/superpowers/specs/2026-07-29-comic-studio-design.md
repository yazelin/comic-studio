# comic-studio 設計書

日期：2026-07-29
狀態：已與 yazelin 對談定案（brainstorming），待實作計劃

## 目標

一個 AI 漫畫製作 studio，把小說（首要目標：token-unlimited 各章）做成漫畫。
單一純前端 PWA，直接部署 GitHub Pages：

- yazelin 本機使用時，製圖打 192.168.11.11 上的 `codex-image-service` 與 `gemini-web`。
- 公開給任何人使用：自帶 baseurl／model／API key（BYO-key），無後端。
- 匯出成品是「一本 PWA 漫畫電子書」：自包含閱讀站，可安裝、可離線，形態同 token-unlimited 閱讀站。

非目標（v1 不做）：頁漫多格排版引擎（資料格式預留格序，引擎列 v2）、伺服器端任何元件、多人協作。

## Repo 與部署

- 公開 repo `comic-studio`，MIT（林亞澤），GitHub Pages 從 root 出。
- 純 vanilla JS 靜態站，無 build。UI 正體中文。
- 頁面：
  - `index.html`：landing 介紹頁＋promo footer 三件套（GitHub／Facebook／BMC）。
  - `studio.html`：工作台本體。
  - `reader-template/`：匯出用閱讀器模板（見「匯出」）。

## Studio 工作流（六站）

1. **專案**：File System Access API 開本機資料夾，所有資料落檔（可進 git）。Chromium-only，landing 註明。
2. **章節匯入**：貼上文字或讀取檔案。
3. **分鏡**：呼叫文字模型把章節切成分鏡腳本 JSON——每格含場景描述、出場角色、構圖提示、對白／旁白。介面可逐格手動編修、增刪、排序。
4. **角色庫**：每角色＝文字設定卡（外觀、服裝、特徵）＋設定參考圖（studio 內生成或上傳）。生圖時文字設定必拼進 prompt，參考圖逐格可勾選是否附帶（兩層一致性）。
5. **生圖**：逐格生成、多候選、重生、選定。prompt 組裝＝全域畫風＋出場角色設定卡＋該格場景／構圖描述。
6. **排版／匯出**：直式條漫。對白氣泡與旁白用 HTML／CSS 疊字，不叫 AI 畫中文字（既定紅線：AI 畫中文字非必翻車，但改字成本高，一律疊字）。

## Provider 設定（可替換 model／baseurl／key）

Provider 清單，每筆＝`{名稱, 類型, baseurl, model, key}`；影像模型與文字模型分開指定。三種 adapter：

| 類型 | 生圖 | 參考圖 | 文字（分鏡） |
|---|---|---|---|
| `codex-image-service` | `POST /v1/images/jobs` → 輪詢 `GET /v1/images/jobs/<id>`（bearer） | `reference_images_base64` 列表 | 無 |
| `gemini-web` | `POST /api/generate`、`POST /api/edit`（帶參考圖） | `/api/edit` 的 images 欄位 | `POST /api/chat` |
| `openai-compatible` | `POST {baseurl}/v1/images/generations`（或 edits） | 依端點能力 | `POST {baseurl}/v1/chat/completions` |

內建 preset（.11 兩台＋空白自訂），使用者可增刪。

**Key 儲存紅線**：`yazelin.github.io` 是共用 origin。API key 預設只留記憶體（分頁關掉即失），使用者勾「記住此瀏覽器」才寫 localStorage（命名空間前綴＋風險警告文字）。

## 專案資料夾格式

```
project.json          # 標題、全域畫風描述、預設 provider 名稱（不含 key）
characters/<id>/
  card.json           # 文字設定卡
  ref.png             # 設定參考圖
chapters/<n>/
  source.md           # 原文
  storyboard.json     # 分鏡腳本（格序欄位預留頁漫 v2）
  panels/<k>/
    cand-*.png        # 候選圖
    chosen.png        # 選定圖
    panel.json        # 對白／氣泡內容與位置
dist/                 # 匯出的 PWA 電子書（產物，可重生）
```

`storyboard.json` 每格：`{id, order, scene, characters:[id], shot, dialogue:[{speaker, text, type}], notes}`。

## 匯出：PWA 漫畫電子書

匯出寫進專案 `dist/`，內容自包含，丟任何靜態空間即可閱讀／安裝／離線：

- `index.html`：直式條漫閱讀器（章節目錄、閱讀進度記憶、圖片 lazy 但 SW 全量 precache）。
- `manifest.json`＋icons。
- `sw.js`：全量 precache、`ignoreSearch`、每頁註冊（遵 PWA 離線 playbook）。
- 選定圖檔與文字資料（氣泡以 HTML 疊在圖上，字型自架或系統字型堆疊）。

## 上游小改（兩個 PR）

- `codex-image-service`：加 CORSMiddleware，allow origins 走 env（預設 `https://yazelin.github.io` ＋ localhost）。
- `gemini-web`：同上。

## 驗證

- 核心純邏輯各留一個可跑 self-check：分鏡 JSON 解析／schema 驗證、prompt 組裝、匯出打包（產物檔案清單與 SW precache 清單一致）。
- 生圖鏈路：dev 流程對 .11 真打一次「角色設定圖 → 帶參考圖生格」驗收（工具驅動開發，證據留 examples/）。
- 手機閱讀體驗：Playwright iPhone 13 模擬驗匯出閱讀器。
