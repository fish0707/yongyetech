// 知識庫模組：從 Google Sheets（發布為 CSV）讀取公司資訊，組成 system prompt。
// 網站聊天視窗（chat.js）與 LINE webhook（line-webhook.js）共用此模組。
//
// 環境變數（設定在 Vercel 後台，不寫進程式碼）：
//   SHEET_CSV_URL_COMPANY  公司資訊分頁的「發布到網路」CSV 連結
//   SHEET_CSV_URL_PLANS    方案分頁的 CSV 連結
//   SHEET_CSV_URL_FAQ      FAQ 分頁的 CSV 連結

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 分鐘
let cache = { data: null, ts: 0 };

// 極簡 CSV 解析（處理雙引號包住的欄位、跳脫的 "" 與換行）。
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* 忽略 */ }
      else field += c;
    }
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

// 把 CSV 轉成物件陣列，第一列當表頭。
function csvToObjects(text) {
  const rows = parseCsv(text).filter(r => r.some(c => c.trim() !== ''));
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (r[i] || '').trim(); });
    return obj;
  });
}

async function fetchCsv(url) {
  if (!url) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`CSV HTTP ${res.status}`);
    return csvToObjects(await res.text());
  } finally {
    clearTimeout(timer);
  }
}

// 讀取三個分頁（含快取）。任一分頁失敗不影響其他分頁；全部失敗且無快取才拋錯。
async function loadKnowledge() {
  if (cache.data && Date.now() - cache.ts < CACHE_TTL_MS) {
    return cache.data;
  }

  const [company, plans, faq] = await Promise.all([
    fetchCsv(process.env.SHEET_CSV_URL_COMPANY).catch(() => null),
    fetchCsv(process.env.SHEET_CSV_URL_PLANS).catch(() => null),
    fetchCsv(process.env.SHEET_CSV_URL_FAQ).catch(() => null),
  ]);

  if (company === null && plans === null && faq === null) {
    if (cache.data) return cache.data; // 用舊快取撐過暫時性失敗
    throw new Error('知識庫讀取失敗：三個分頁皆無法取得');
  }

  const data = { company: company || [], plans: plans || [], faq: faq || [] };
  cache = { data, ts: Date.now() };
  return data;
}

function buildSystemPrompt({ company, plans, faq }) {
  const companyMap = {};
  company.forEach(r => { if (r['欄位']) companyMap[r['欄位']] = r['值']; });
  const companyName = companyMap['公司名稱'] || '詠業科技行銷有限公司';

  const companyLines = company.length
    ? company.map(r => `- ${r['欄位']}：${r['值']}`).join('\n')
    : '- 台中在地印表機租賃專家';

  const planLines = plans.length
    ? plans.map(r => {
        const note = r['備註'] ? `（${r['備註']}）` : '';
        return `- ${r['方案名稱']}：月費 ${r['月費']}，租期 ${r['租期']}，內容：${r['內容']}${note}`;
      }).join('\n')
    : '- 方案資訊請引導客戶來電洽詢';

  const faqLines = faq.length
    ? faq.map(r => `Q（${r['類別']}）：${r['問題']}\nA：${r['答案']}`).join('\n')
    : '';

  return `你是「${companyName}」的專業 AI 客服助理。

公司概況：
${companyLines}

方案資訊：
${planLines}
${faqLines ? `\n常見問答：\n${faqLines}\n` : ''}
回答規則：
- 一律使用繁體中文（台灣口語）回答，語氣親切、專業；不要使用簡體字或英文。
- 回答簡短精確，不要超過 150 字。
- 只回答與印表機租賃、辦公設備、公司服務相關的問題。
- 如果問題與公司業務完全無關，請以「【超出範圍】」開頭，然後說明只能回答印表機租賃相關問題。
- 如果遇到複雜客訴、合約糾紛、或需要人工判斷的情況，請以「【需要真人】」開頭，然後簡短說明原因。
- 如果詢問報價，提供大概方向並引導客戶聯繫。
- 不要編造不確定的資訊；不知道的就引導客戶聯繫真人。`;
}

// 對外主要介面：回傳當前 system prompt 字串。
async function getSystemPrompt() {
  const knowledge = await loadKnowledge();
  return buildSystemPrompt(knowledge);
}

module.exports = { getSystemPrompt, loadKnowledge, buildSystemPrompt, parseCsv, csvToObjects };
