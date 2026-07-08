// LINE 官方帳號 Webhook。客戶傳訊息 -> 驗證簽章 -> 呼叫知識庫+NVIDIA -> Reply API 回覆。
// 與網站聊天視窗共用 _lib/knowledge.js、_lib/llm.js。
//
// 環境變數（設定在 Vercel 後台）：
//   LINE_CHANNEL_SECRET        用於驗證 X-Line-Signature
//   LINE_CHANNEL_ACCESS_TOKEN  用於呼叫 Reply API
//
// 重要：LINE 簽章必須用「原始 request body 位元組」做 HMAC-SHA256 比對，
// 不能用被重新序列化的 body（位元組會不同、驗證會失敗）。因此本檔直接從
// 請求串流讀原始 bytes，全程不存取 req.body。

const crypto = require('crypto');
const { getSystemPrompt } = require('./_lib/knowledge');
const { callLLM } = require('./_lib/llm');

const LINE_REPLY_ENDPOINT = 'https://api.line.me/v2/bot/message/reply';
const FALLBACK_TEXT = '不好意思，系統忙線中，請直接來電 0926-554511，或稍後再試 🙏';

// 從 Node 串流讀取原始 body（Buffer）。
async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

// 驗證 LINE 簽章（timing-safe 比對）。
function verifySignature(rawBody, signature, channelSecret) {
  if (!signature) return false;
  const expected = crypto
    .createHmac('SHA256', channelSecret)
    .update(rawBody)
    .digest('base64');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function replyToLine(replyToken, text, accessToken) {
  const res = await fetch(LINE_REPLY_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: 'text', text }],
    }),
  });
  if (!res.ok) {
    console.error('LINE reply error', res.status, await res.text());
  }
}

// 針對單一事件產生回覆文字並回覆。
async function handleEvent(event, systemPromptPromise, accessToken) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    // 非文字訊息（貼圖、圖片等）或非訊息事件：文字類才回覆引導語。
    if (event.replyToken) {
      await replyToLine(event.replyToken, '您好！請用文字描述您的問題，我來為您解答 😊', accessToken);
    }
    return;
  }

  const userText = event.message.text;
  let reply;
  try {
    const systemPrompt = await systemPromptPromise;
    reply = await callLLM({
      messages: [{ role: 'user', content: userText }],
      systemPrompt,
    });
    // LINE 端不需要標記前綴，去掉讓客戶看到乾淨訊息。
    reply = reply.replace(/^【(需要真人|超出範圍)】\s*/, '');
  } catch (err) {
    console.error('LINE handleEvent error:', err.message);
    reply = FALLBACK_TEXT;
  }
  await replyToLine(event.replyToken, reply, accessToken);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!channelSecret || !accessToken) {
    console.error('LINE env vars not set');
    return res.status(500).end();
  }

  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (err) {
    console.error('readRawBody error:', err.message);
    return res.status(400).end();
  }

  if (!verifySignature(rawBody, req.headers['x-line-signature'], channelSecret)) {
    return res.status(401).end();
  }

  let body;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).end();
  }

  const events = Array.isArray(body.events) ? body.events : [];
  // 只在有文字事件時才載入知識庫；多個事件共用同一份 system prompt。
  const systemPromptPromise = getSystemPrompt();

  try {
    await Promise.all(events.map(ev => handleEvent(ev, systemPromptPromise, accessToken)));
  } catch (err) {
    console.error('webhook processing error:', err.message);
  }

  // 無論個別回覆成敗，都回 200，避免 LINE 重送。
  return res.status(200).json({ ok: true });
};

// 停用 Vercel 的自動 body 解析，確保能取得原始 body 供簽章驗證（雙保險）。
module.exports.config = { api: { bodyParser: false } };
