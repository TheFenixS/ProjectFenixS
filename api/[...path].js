export default async function handler(req, res) {
  const rawPath = req.url.split('?')[0];        // esim. "/api/pump/analyze"
  const withoutApi = rawPath.replace(/^\/api\//, ''); // "pump/analyze"
  const parts = withoutApi.split('/');
  const service = parts[0];                     // "pump"
  const targetPath = parts.slice(1).join('/');  // "analyze"

  // Valitaan oikea backend palvelun mukaan
  let BASE_URL, TOKEN;
  if (service === 'inventory') {
    BASE_URL = process.env.HF_INVENTORY_URL;
    TOKEN    = process.env.HF_INVENTORY_TOKEN;
  } else if (service === 'pump') {
    BASE_URL = process.env.HF_PUMP_URL;
    TOKEN    = process.env.HF_PUMP_TOKEN;
  } else if (service === 'portfolio') {
    BASE_URL = process.env.HF_PORTFOLIO_URL;
    TOKEN    = process.env.HF_PORTFOLIO_TOKEN;
  } else {
    return res.status(400).json({ error: `Unknown service: ${service}` });
  }

  if (!BASE_URL || !TOKEN) {
    return res.status(500).json({
      error: 'Missing env vars',
      need: `HF_${service.toUpperCase()}_URL and HF_${service.toUpperCase()}_TOKEN`,
    });
  }

  const cleanBase = BASE_URL.replace(/\/+$/, '').replace(/\/api\/?$/, '');
  const finalUrl  = `${cleanBase}/api/${targetPath}`;

  console.log(`[proxy] ${req.method} ${service}/${targetPath} → ${finalUrl}`);

  try {
    const response = await fetch(finalUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOKEN}`,
      },
      body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
    });

    const text = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Upstream error ${response.status}`,
        detail: text.slice(0, 500),
        tried_url: finalUrl,
      });
    }

    try {
      return res.status(200).json(JSON.parse(text));
    } catch {
      return res.status(200).send(text);
    }

  } catch (err) {
    return res.status(502).json({
      error: 'Proxy fetch failed',
      detail: err.message,
      tried_url: finalUrl,
    });
  }
}
