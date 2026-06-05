const https = require('https');

function httpsPost(url, headers, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const data = JSON.stringify(body);
    const req = https.request(
      {
        hostname: urlObj.hostname,
        path: urlObj.pathname,
        method: 'POST',
        headers: { ...headers, 'Content-Length': Buffer.byteLength(data) },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
          catch { resolve({ status: res.statusCode, body: raw }); }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  res.setHeader('Access-Control-Allow-Origin', '*');

  const { prompt } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  try {
    const result = await httpsPost(
      'https://api.anthropic.com/v1/messages',
      {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2500,
        messages: [{ role: 'user', content: prompt }],
      }
    );

    if (result.status === 200) {
      return res.status(200).json({ text: result.body.content[0].text });
    } else {
      return res.status(500).json({ error: 'Anthropic error', detail: result.body });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
