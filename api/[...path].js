// api/[...path].js
// Vercel catch-all: nappaaa KAIKKI /api/* pyynnöt
// Esim: /api/inventory/scrape → HF_INVENTORY_URL/api/scrape

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Vercel asettaa [...path] queryn automaattisesti
  // esim. /api/inventory/scrape → req.query.path = ['inventory', 'scrape']
  const pathParts = req.query.path || [];

  const service = pathParts[0];           // 'inventory' | 'pump' | 'portfolio'
  const endpoint = pathParts.slice(1).join('/'); // 'scrape' | 'analyze' | 'portfolio/user123'

  const serviceMap = {
    inventory: {
      url:   process.env.HF_INVENTORY_URL,
      token: process.env.HF_INVENTORY_TOKEN,
    },
    pump: {
      url:   process.env.HF_PUMP_URL,
      token: process.env.HF_PUMP_TOKEN,
    },
    portfolio: {
      url:   process.env.HF_PORTFOLIO_URL,
      token: process.env.HF_PORTFOLIO_TOKEN,
    },
  };

  const svc = serviceMap[service];

  if (!svc) {
    return res.status(400).json({
      error: `Tuntematon palvelu: "${service}"`,
      saatavilla: Object.keys(serviceMap),
      path_received: pathParts,
    });
  }

  if (!svc.url || !svc.token) {
    return res.status(500).json({
      error: 'Puuttuvat env-muuttujat Vercelissä',
      tarkista: `HF_${service.toUpperCase()}_URL ja HF_${service.toUpperCase()}_TOKEN`,
    });
  }

  // Rakennetaan kohde-URL: https://your-space.hf.space/api/scrape
  const cleanBase = svc.url.replace(/\/+$/, '');
  const finalUrl = `${cleanBase}/api/${endpoint}`;

  console.log(`[proxy] ${req.method} /${pathParts.join('/')} → ${finalUrl}`);

  try {
    const options = {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${svc.token}`,
      },
    };

    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
      options.body = typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body);
    }

    const upstream = await fetch(finalUrl, options);
    const text = await upstream.text();

    console.log(`[proxy] upstream ${upstream.status} from ${finalUrl}`);

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: `Upstream ${upstream.status}`,
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
      error: 'Proxy fetch epäonnistui',
      detail: err.message,
      tried_url: finalUrl,
    });
  }
}
