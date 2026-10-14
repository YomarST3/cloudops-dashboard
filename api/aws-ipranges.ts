const SOURCE_URL = 'https://ip-ranges.amazonaws.com/ip-ranges.json';

const cache = new Map<string, Promise<any>>();

function fetchJson(url: string): Promise<any> {
  if (cache.has(url)) return cache.get(url) as Promise<any>;
  const promise = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (CloudOpsDashboard)', 'Accept-Encoding': 'gzip' }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} en ${url}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  })();
  cache.set(url, promise);
  return promise;
}

export default async function handler(req: any, res: any) {
  const allowOrigin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=43200, stale-while-revalidate=43200');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const service = String(req.query.service || '').trim().toUpperCase();
  const region = String(req.query.region || '').trim();

  try {
    const data = await fetchJson(SOURCE_URL);
    const entries: Array<{ prefix: string; region: string; service: string; ipv6: boolean }> = [];

    for (const p of data?.prefixes || []) {
      if (p?.ip_prefix && p?.service && p?.region) {
        entries.push({ prefix: p.ip_prefix, region: p.region, service: p.service, ipv6: false });
      }
    }
    for (const p of data?.ipv6_prefixes || []) {
      if (p?.ipv6_prefix && p?.service && p?.region) {
        entries.push({ prefix: p.ipv6_prefix, region: p.region, service: p.service, ipv6: true });
      }
    }

    if (service) {
      const filtered = entries.filter((e) => (region ? e.region === region : true) && e.service === service);
      res.status(200).json({
        createDate: data.createDate,
        syncToken: data.syncToken,
        source: 'AWS IP Ranges (ip-ranges.amazonaws.com/ip-ranges.json)',
        service,
        region: region || null,
        count: filtered.length,
        prefixes: filtered.slice(0, 2000)
      });
      return;
    }

    const byService = new Map<string, number>();
    for (const e of entries) {
      byService.set(e.service, (byService.get(e.service) || 0) + 1);
    }
    const services = [...byService.entries()]
      .map(([name, count]) => ({ service: name, count }))
      .sort((a, b) => b.count - a.count);

    res.status(200).json({
      createDate: data.createDate,
      syncToken: data.syncToken,
      source: 'AWS IP Ranges (ip-ranges.amazonaws.com/ip-ranges.json)',
      total: entries.length,
      services
    });
  } catch (error: any) {
    res.status(502).json({ error: 'No se pudo consultar los rangos IP de AWS', detail: error?.message });
  }
}