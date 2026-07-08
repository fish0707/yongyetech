# 智慧客服機器人設定說明

網站聊天視窗與 LINE@ 官方帳號共用同一套後端（NVIDIA API + Google Sheets 知識庫）。
本次新增／修改的檔案：

| 檔案 | 說明 |
|---|---|
| `api/_lib/knowledge.js` | 讀取 Google Sheets 知識庫（含 10 分鐘快取），組成 system prompt |
| `api/_lib/llm.js` | 呼叫 NVIDIA NIM API |
| `api/chat.js` | 網站聊天視窗後端（已從 Anthropic 改為 NVIDIA，前端契約不變） |
| `api/line-webhook.js` | LINE Webhook：驗證簽章 → 產生回答 → Reply API 回覆 |

程式碼**不含任何金鑰**，全部靠下方環境變數。

---

## 一、Vercel 環境變數（Settings → Environment Variables）

| 變數名 | 內容 | 從哪裡取得 |
|---|---|---|
| `NVIDIA_API_KEY` | `nvapi-...` | build.nvidia.com 任一模型頁 → Get API Key |
| `NVIDIA_MODEL` | 模型 ID（選填） | build.nvidia.com 目錄，例：`meta/llama-3.3-70b-instruct` 或 Qwen 系列。不填用預設 |
| `LINE_CHANNEL_SECRET` | Channel Secret | LINE Developers Console → 你的 channel → Basic settings |
| `LINE_CHANNEL_ACCESS_TOKEN` | Channel Access Token（長期） | LINE Developers Console → Messaging API → Issue |
| `SHEET_CSV_URL_COMPANY` | 公司資訊分頁 CSV 連結 | Google Sheets → 檔案 → 共用 → 發布到網路 |
| `SHEET_CSV_URL_PLANS` | 方案分頁 CSV 連結 | 同上 |
| `SHEET_CSV_URL_FAQ` | FAQ 分頁 CSV 連結 | 同上 |

> 舊的 `ANTHROPIC_API_KEY` 可先保留作備援，穩定運行後再移除。

---

## 二、Google Sheets 知識庫（三個分頁，欄位名稱要一致）

**分頁「公司資訊」**（兩欄）

| 欄位 | 值 |
|---|---|
| 公司名稱 | 詠業科技行銷有限公司 |
| 服務範圍 | 台中市全區 |
| 電話 | 0926-554511 |
| Email | henrychen0211@gmail.com |
| LINE | @unz7281h |
| 簡介 | 台中在地印表機租賃專家，深耕 10 年，200+ 企業客戶 |

**分頁「方案」**

| 方案名稱 | 月費 | 租期 | 內容 | 備註 |
|---|---|---|---|---|
| 基本方案 | $2,500/月起 | 12 個月起 | 黑白印表機×1、月 5,000 張、48H 維修響應 | |
| 商務方案 | $5,800/月起 | 12 個月起 | 黑白+彩色各 1 台、月 15,000 張、月送碳粉、24H 到府維修 | |
| 企業旗艦 | 依需求客製 | 客製 | 多台多功能事務機、無限量列印、4H 緊急維修 | 需業務洽談 |

**分頁「FAQ」**

| 類別 | 問題 | 答案 |
|---|---|---|
| 維修 | 機器壞了多久會來修？ | 依方案 48H／24H／4H 到府維修 |
| ...（建議再補 10–20 條實際常被問的問題，機器人會更準）| | |

發布方式：每個分頁各自「發布到網路」→ 格式選 **逗號分隔值 (.csv)** → 複製連結，分別填到對應環境變數。
改試算表內容後，最慢約 15 分鐘生效（Google 發布端約 5 分鐘 + 本程式快取 10 分鐘），不需重新部署。

---

## 三、LINE Developers Console 設定

1. 為官方帳號 @unz7281h 開通 **Messaging API** channel。
2. **Webhook URL** 設為：`https://<你的網站網域>/api/line-webhook`，並開啟「Use webhook」。
3. 關閉「自動回應訊息」（Auto-reply messages），避免與機器人重複回覆。
4. 取得 Channel Secret 與 Channel Access Token，填入 Vercel 環境變數。

---

## 四、上線前測試清單

- [ ] 網站聊天視窗問「你們有什麼方案？」→ 正確列出方案（與試算表一致）
- [ ] LINE 傳「租一個月多少錢？」→ 5 秒內收到繁中回覆，價格正確
- [ ] LINE 傳「今天天氣如何？」→ 回覆委婉表示只能回答租賃相關問題
- [ ] LINE 傳貼圖 → 回覆「請用文字描述您的問題」
- [ ] 改試算表方案價格 → 15 分鐘後再問，回答已更新
- [ ] 用工具對 webhook 送錯誤簽章 → 回 401，LINE 上無異常回覆

---

## 備註

- 本版 LINE 端為單則獨立回答（無多輪記憶），system prompt 已引導一次回答完整。
- NVIDIA 免費額度 1,000 點（可申請至 5,000），上線首週請每日到 build.nvidia.com 查看用量。
