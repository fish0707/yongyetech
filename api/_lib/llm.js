// LLM 模組：呼叫 NVIDIA NIM API（OpenAI 相容的 chat/completions 端點）。
// 網站聊天視窗與 LINE webhook 共用。
//
// 環境變數（設定在 Vercel 後台）：
//   NVIDIA_API_KEY  build.nvidia.com 產生的金鑰（nvapi-...）
//   NVIDIA_MODEL    模型 ID（選填）。未設定時用預設值，可到 build.nvidia.com 目錄挑選後改此變數，不必改程式。

const NVIDIA_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';
const DEFAULT_MODEL = 'meta/llama-3.3-70b-instruct';
const TIMEOUT_MS = 15000;

// messages: [{ role: 'user' | 'assistant', content }]（不含 system）
// systemPrompt: 字串，會以 system 角色置於最前面。
async function callLLM({ messages, systemPrompt }) {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error('NVIDIA_API_KEY is not set');

  const model = process.env.NVIDIA_MODEL || DEFAULT_MODEL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(NVIDIA_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        max_tokens: 1024,
        temperature: 0.3,
      }),
      signal: controller.signal,
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(`NVIDIA API error ${res.status}: ${JSON.stringify(data)}`);
    }

    const reply = data.choices?.[0]?.message?.content?.trim() || '';
    if (!reply) throw new Error('NVIDIA API 回傳空內容');
    return reply;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { callLLM };
