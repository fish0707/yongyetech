export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  try {
    const { messages } = req.body;

    // 把 messages 轉成 OpenAI 格式（和 Anthropic 一樣，可直接用）
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',  // 便宜又夠用
        max_tokens: 1000,
        messages: [
          {
            role: 'system',
            content: `你是「詠業科技行銷有限公司」的專業 AI 客服助理。

公司概況：
- 台中在地印表機租賃專家，深耕10年，200+企業客戶
- 主要服務：黑白/彩色印表機租賃、多功能事務機出租、定期保養維修、碳粉耗材補送
- 服務範圍：台中市全區
- 聯絡方式：電話 0926-554511、Email henrychen0211@gmail.com、LINE: @unz7281h

方案資訊：
1. 基本方案：$2,500/月起，12個月起，黑白印表機×1，月5000張，48H維修響應
2. 商務方案：$5,800/月起，黑白+彩色各1台，月15000張，月送碳粉，24H到府維修
3. 企業旗艦：依需求客製，多台多功能事務機，無限量列印，4H緊急維修

回答規則：
- 用親切、專業的繁體中文回答（台灣口語）
- 回答簡短精確，不要超過150字
- 只回答與印表機租賃、辦公設備、公司服務相關的問題
- 如果問題與公司業務完全無關（例如：天氣、食譜、政治、娛樂等），請回覆：【超出範圍】然後說明你只能回答印表機租賃相關問題
- 如果遇到複雜的客訴、合約糾紛、或需要人工判斷的情況，請回覆：【需要真人】然後說明原因
- 如果詢問報價，提供大概方向並引導聯繫
- 不要編造不確定的資訊`
          },
          ...messages
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('OpenAI error:', data);
      return res.status(response.status).json({ error: data });
    }

    const reply = data.choices?.[0]?.message?.content || '';
    return res.status(200).json({ reply });

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
