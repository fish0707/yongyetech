// 網站聊天視窗後端。前端契約不變：POST { messages: [{role, content}] } -> { reply }。
// 改用 NVIDIA API，公司資訊改由 Google Sheets 知識庫動態載入（見 _lib/knowledge.js、_lib/llm.js）。

const { getSystemPrompt } = require('./_lib/knowledge');
const { callLLM } = require('./_lib/llm');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages } = req.body || {};
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid messages format' });
  }

  try {
    const systemPrompt = await getSystemPrompt();
    const reply = await callLLM({ messages, systemPrompt });
    return res.status(200).json({ reply });
  } catch (error) {
    console.error('chat handler error:', error.message);
    return res.status(500).json({ error: error.message });
  }
};
