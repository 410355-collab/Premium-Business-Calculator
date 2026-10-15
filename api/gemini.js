// Vercel Edge Function: Google Gemini API Proxy
// 特性：Edge Runtime 邊緣計算，全球就近節點毫秒回應、0 冷啟動延遲

export const config = {
  runtime: 'edge', // 啟用邊緣極速執行環境 (大幅提升辨識速度)
};

export default async function handler(req) {
  // 處理 OPTIONS 預檢請求
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, x-goog-api-key',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  // 優先從環境變數取得 API Key，若客戶端自帶 Header Key 則使用客戶端的
  const clientKey = req.headers.get('x-goog-api-key');
  const apiKey = clientKey || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error: { message: '後端未設定 GEMINI_API_KEY 環境變數，請在 Vercel 設定環境變數。' }
      }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }

  try {
    const urlObj = new URL(req.url);
    const model = urlObj.searchParams.get('model') || 'gemini-flash-lite-latest';
    const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

    const bodyJson = await req.json();
    delete bodyJson.model;

    // 直接串流轉發 Google Gemini API，實現近乎直連的極速回應
    const googleRes = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(bodyJson),
    });

    const data = await googleRes.text();

    return new Response(data, {
      status: googleRes.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: { message: err.message || '邊緣代理轉發異常' } }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }
}
