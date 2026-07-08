// LLM 模組：呼叫任何 OpenAI 相容的 chat/completions 端點。
// 網站聊天視窗與 LINE webhook 共用。
//
// 環境變數（設定在 Vercel 後台）：
//   LLM_ENDPOINT  完整的 chat/completions 網址（選填）。未設定時用 NVIDIA。
//   LLM_API_KEY   對應供應商的金鑰。未設定時退回讀 NVIDIA_API_KEY（向後相容）。
//   LLM_MODEL     模型 ID（選填）。未設定時退回讀 NVIDIA_MODEL，再退回預設值。
//
// 切換供應商只改環境變數，不必改程式。三家的 body 格式相同：
//   NVIDIA      https://integrate.api.nvidia.com/v1/chat/completions
//   Groq        https://api.groq.com/openai/v1/chat/completions
//   OpenRouter  https://openrouter.ai/api/v1/chat/completions

const DEFAULT_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';
const DEFAULT_MODEL = 'meta/llama-3.3-70b-instruct';
const TIMEOUT_MS = 15000;

// messages: [{ role: 'user' | 'assistant', content }]（不含 system）
// systemPrompt: 字串，會以 system 角色置於最前面。
async function callLLM({ messages, systemPrompt }) {
  const apiKey = process.env.LLM_API_KEY || process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error('LLM_API_KEY is not set');

  const endpoint = process.env.LLM_ENDPOINT || DEFAULT_ENDPOINT;
  const model = process.env.LLM_MODEL || process.env.NVIDIA_MODEL || DEFAULT_MODEL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(endpoint, {
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
      throw new Error(`LLM API error ${res.status}: ${JSON.stringify(data)}`);
    }

    const reply = data.choices?.[0]?.message?.content?.trim() || '';
    if (!reply) throw new Error('LLM API 回傳空內容');
    return reply;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { callLLM };
