const https = require('https');

function httpsPost(url, headers, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const data = typeof body === 'string' ? body : JSON.stringify(body);
    const req = https.request(
      {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: { ...headers, 'Content-Length': Buffer.byteLength(data) },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode, body: raw });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function getAccessToken() {
  const { AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET } = process.env;
  const tokenUrl = `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: AZURE_CLIENT_ID,
    client_secret: AZURE_CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
  }).toString();

  const res = await httpsPost(tokenUrl, { 'Content-Type': 'application/x-www-form-urlencoded' }, body);
  if (res.status !== 200) throw new Error(`Token error ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body.access_token;
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  const { platform, date, time, headline, caption, hashtags, pillar } = req.body || {};

  if (!platform || !date || !time || !headline) {
    return res.status(400).json({ error: 'Missing required fields: platform, date, time, headline' });
  }

  // Build start/end datetimes (date = "YYYY-MM-DD", time = "HH:MM")
  const startDateTime = `${date}T${time}:00`;
  const [h, m] = time.split(':').map(Number);
  const endMinutes = h * 60 + m + 30;
  const endH = String(Math.floor(endMinutes / 60) % 24).padStart(2, '0');
  const endM = String(endMinutes % 60).padStart(2, '0');
  const endDateTime = `${date}T${endH}:${endM}:00`;

  const bodyContent = [
    caption || '',
    '',
    hashtags || '',
    '',
    pillar ? `Pillar: ${pillar}` : '',
  ]
    .join('\n')
    .trim();

  const event = {
    subject: `POST: ${platform} — ${headline}`,
    body: {
      contentType: 'text',
      content: bodyContent,
    },
    start: { dateTime: startDateTime, timeZone: 'Australia/Sydney' },
    end: { dateTime: endDateTime, timeZone: 'Australia/Sydney' },
    isReminderOn: true,
    reminderMinutesBeforeStart: 60,
  };

  try {
    const token = await getAccessToken();
    const userEmail = 'info@onesideaustralia.com.au';
    const graphUrl = `https://graph.microsoft.com/v1.0/users/${userEmail}/events`;

    const graphRes = await httpsPost(
      graphUrl,
      {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      event
    );

    if (graphRes.status === 201) {
      return res.status(200).json({ success: true, eventId: graphRes.body.id });
    } else {
      return res.status(500).json({ error: 'Graph API error', detail: graphRes.body });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
