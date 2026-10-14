const SOURCE_URL = 'https://api.regional-table.region-services.aws.a2z.com/index.json';

const cache = new Map<string, Promise<any>>();

function fetchJson(url: string): Promise<any> {
  if (cache.has(url)) return cache.get(url) as Promise<any>;
  const promise = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (CloudOpsDashboard)' }
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
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=86400');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const region = String(req.query.region || '').trim();
  const service = String(req.query.service || '').trim();

  try {
    const data = await fetchJson(SOURCE_URL);
    const byService = new Map<string, { regions: Set<string>; serviceUrl: string }>();

    for (const entry of data?.prices || []) {
      const attrs = entry?.attributes || {};
      const name = attrs['aws:serviceName'];
      const reg = attrs['aws:region'];
      if (!name || !reg) continue;
      let rec = byService.get(name);
      if (!rec) {
        rec = { regions: new Set(), serviceUrl: attrs['aws:serviceUrl'] || '' };
        byService.set(name, rec);
      }
      rec.regions.add(reg);
    }

    const allRegions = new Set<string>();
    let list = [...byService.entries()].map(([name, rec]) => {
      const regions = [...rec.regions];
      regions.forEach((r) => allRegions.add(r));
      return { name, regions, serviceUrl: rec.serviceUrl };
    });

    if (service) {
      const term = service.toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(term));
    }

    let regionObj: string | null = null;
    if (region) {
      regionObj = region;
      list = list
        .filter((s) => s.regions.includes(region))
        .map((s) => ({ ...s, regions: s.regions.filter((r) => r === region) }));
    }

    res.status(200).json({
      updatedAt: new Date().toISOString(),
      source: 'AWS Regional Table (api.regional-table.region-services.aws.a2z.com)',
      regionCount: allRegions.size,
      serviceCount: byService.size,
      region: regionObj,
      services: list
    });
  } catch (error: any) {
    res.status(502).json({ error: 'No se pudo consultar la tabla regional de AWS', detail: error?.message });
  }
}