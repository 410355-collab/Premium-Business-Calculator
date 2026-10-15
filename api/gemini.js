// Vercel Serverless Function: Google Gemini API Proxy
// 目的：保護 API Key 不外洩至 GitHub / 前端

export default async function handler(req, res) {
  // 處理 CORS 跨域設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-goog-api-key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 優先使用後端環境變數中的 GEMINI_API_KEY；若請求 header 自帶 Key 則尊重該 Key
  const apiKey = req.headers['x-goog-api-key'] || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: {
        message: '後端未設定 GEMINI_API_KEY 環境變數，請在 Vercel 設定環境變數。'
      }
    });
  }

  // 取得請求模型名稱 (預設 gemini-flash-lite-latest)
  const model = req.query.model || req.body.model || 'gemini-flash-lite-latest';
  const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  try {
    // 移除 body 中的 model 參數，其餘 payload 直接轉發給 Gemini
    const bodyToSend = { ...req.body };
    delete bodyToSend.model;

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify(bodyToSend)
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    console.error('[Gemini Proxy Error]:', err);
    return res.status(500).json({
      error: {
        message: err.message || '後端代理轉發發生異常'
      }
    });
  }
}
