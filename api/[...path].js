export default async function handler(req, res) {
  const rawPath = req.url.split('?')[0];
  const pathWithoutApi = rawPath.replace(/^\/api\//, '');
  
  const parts = pathWithoutApi.split('/');
  const service = parts[0];               
  const targetPath = parts.slice(1).join('/'); 

  let BASE_URL = '';
  let TOKEN = ''; // Muutettu: Token määritellään tyhjäksi alussa

  // Määritellään oikea URL ja oikea Token palvelun mukaan
  if (service === 'inventory') {
    BASE_URL = process.env.HF_INVENTORY_URL;
    TOKEN = process.env.HF_INVENTORY_TOKEN;
  } else if (service === 'pump') {
    BASE_URL = process.env.HF_PUMP_URL;
    TOKEN = process.env.HF_PUMP_TOKEN;
  } else if (service === 'portfolio') {
    BASE_URL = process.env.HF_PORTFOLIO_URL;
    TOKEN = process.env.HF_PORTFOLIO_TOKEN;
  }

  // Tarkistetaan, että sekä URL että Token löytyivät
  if (!BASE_URL || !TOKEN) {
    return res.status(500).json({ error: 'Puuttuvat ympäristömuuttujat (URL tai Token)', service_requested: service });
  }

  const cleanBase = BASE_URL.replace(/\/+$/, '');
  const finalUrl = `${cleanBase}/${targetPath.startsWith('api/') ? targetPath : 'api/' + targetPath}`;

  try {
    const options = {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        // Tässä koodi lisää Bearer-sanan automaattisesti!
        'Authorization': `Bearer ${TOKEN}`,
      }
    };
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
      options.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }

    const response = await fetch(finalUrl, options);
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
    return res.status(502).json({ error: 'Proxy fetch failed', detail: err.message, tried_url: finalUrl });
  }
}
