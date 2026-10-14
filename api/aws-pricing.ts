import snapshot from '../src/data/awsPriceSnapshot.json' with { type: 'json' };

const PRICING_BASE = 'https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws';
const HOURS_PER_MONTH = 720;
const BIG_OFFER_MAX_BYTES = 40 * 1024 * 1024;
const cache = new Map<string, Promise<any>>();

const CF_TRANSFER_BY_REGION: Record<string, string> = {
  'us-east-1': 'US-DataTransfer-Out-Bytes',
  'eu-west-1': 'EU-DataTransfer-Out-Bytes',
  'ap-southeast-1': 'AP-DataTransfer-Out-Bytes',
  'sa-east-1': 'SA-DataTransfer-Out-Bytes'
};

// t3.large Linux Shared On-Demand (USD/h) — referencia documentada.
// EC2 no es consultable en vivo aquí (su offer JSON pesa ~481 MB, inviable en
// una función serverless gratuita), así que usamos la tarifa on-demand
// publicada por región como referencia.
const EC2_T3_LARGE_LINUX_HOURLY_BY_REGION: Record<string, number> = {
  'us-east-1': 0.0832,
  'eu-west-1': 0.0912,
  'ap-southeast-1': 0.1136,
  'sa-east-1': 0.1664
};

function fetchJson(url: string): Promise<any> {
  if (cache.has(url)) return cache.get(url) as Promise<any>;
  const promise = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
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

function firstTierPrice(offer: any, sku: string) {
  const od = offer?.terms?.OnDemand?.[sku];
  if (!od) return null;
  for (const termKey of Object.keys(od)) {
    for (const rateKey of Object.keys(od[termKey].priceDimensions || {})) {
      const dim = od[termKey].priceDimensions[rateKey];
      const usd = Number(dim.pricePerUnit?.USD);
      if (dim.beginRange === '0' && Number.isFinite(usd) && usd > 0) {
        return { perUnit: usd, unit: dim.unit, description: dim.description };
      }
    }
  }
  return null;
}

function findSku(offer: any, matches: (attrs: Record<string, string>) => boolean) {
  for (const [sku, prod] of Object.entries(offer.products || {})) {
    if ((prod as any).attributes && matches((prod as any).attributes)) return sku;
  }
  return null;
}

async function s3Monthly(regionCode: string) {
  const offer = await fetchJson(`${PRICING_BASE}/AmazonS3/current/${regionCode}/index.json`);
  const sku = findSku(
    offer,
    (a) => /^(?:[A-Z0-9]+-)?TimedStorage-ByteHrs$/.test(a.usagetype || '') && a.regionCode === regionCode
  );
  if (!sku) return null;
  const price = firstTierPrice(offer, sku);
  if (!price) return null;
  return { monthly: price.perUnit * 1024, detail: `${price.description} × 1 TB (1024 GB-Mo)` };
}

async function lambdaMonthly(regionCode: string) {
  const offer = await fetchJson(`${PRICING_BASE}/AWSLambda/current/${regionCode}/index.json`);
  const findRegional = (matches: (a: Record<string, string>) => boolean) =>
    findSku(offer, (a) => matches(a) && a.regionCode === regionCode) ??
    findSku(offer, (a) => matches(a) && !a.regionCode);
  const reqSku = findRegional((a) => (a.group || '') === 'AWS-Lambda-Requests');
  const gbSku = findRegional((a) => (a.group || '') === 'AWS-Lambda-Duration' && /Lambda-GB-Second$/.test(a.usagetype || ''));
  const reqPrice = reqSku ? firstTierPrice(offer, reqSku) : null;
  const gbPrice = gbSku ? firstTierPrice(offer, gbSku) : null;
  const requests = reqPrice ? reqPrice.perUnit * 3_000_000 : 0;
  const compute = gbPrice ? gbPrice.perUnit * 50_000 : 0;
  return {
    monthly: requests + compute,
    detail: `${reqPrice ? reqPrice.description : 'Requests'} (3M invoc.) + ${gbPrice ? gbPrice.description : 'Compute'} (50K GB-s)`
  };
}

async function cloudfrontMonthly(regionCode: string) {
  const usagetype = CF_TRANSFER_BY_REGION[regionCode] || 'US-DataTransfer-Out-Bytes';
  const offer = await fetchJson(`${PRICING_BASE}/AmazonCloudFront/current/index.json`);
  const sku = findSku(offer, (a) => a.usagetype === usagetype);
  if (!sku) return null;
  const price = firstTierPrice(offer, sku);
  if (!price) return null;
  return { monthly: price.perUnit * 400, detail: `${price.description} × 400 GB/mes (primer tramo)` };
}

async function route53Monthly(regionCode: string) {
  const global = await fetchJson(`${PRICING_BASE}/AmazonRoute53/current/index.json`);
  const zoneSku = findSku(global, (a) => a.usagetype === 'HostedZone');
  const zonePrice = zoneSku ? firstTierPrice(global, zoneSku) : null;

  const regional = await fetchJson(`${PRICING_BASE}/AmazonRoute53/current/${regionCode}/index.json`);
  const querySku = findSku(regional, (a) => /DNS-Queries$/.test(a.usagetype || ''));
  const queryPrice = querySku ? firstTierPrice(regional, querySku) : null;

  const zones = zonePrice ? zonePrice.perUnit * 1 : 0;
  const queries = queryPrice ? queryPrice.perUnit * 10_000_000 : 0;
  return {
    monthly: zones + queries,
    detail: `${zonePrice ? zonePrice.description : 'Hosted zone'} (1 zona) + ${queryPrice ? queryPrice.description : 'Queries'} (10M consultas)`
  };
}

function fetchOfferGuarded(url: string): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  return (async () => {
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (CloudOpsDashboard)', 'Accept-Encoding': 'identity' }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} en ${url}`);
      const length = Number(response.headers.get('content-length') || 0);
      if (length > BIG_OFFER_MAX_BYTES) return null;
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  })();
}

async function rdsMonthly(regionCode: string) {
  const offer = await fetchOfferGuarded(`${PRICING_BASE}/AmazonRDS/current/${regionCode}/index.json`);
  if (!offer) return null;
  const sku = findSku(
    offer,
    (a) =>
      a.instanceType === 'db.t4g.medium' &&
      (a.databaseEngine === 'PostgreSQL' || a.dbEngine === 'PostgreSQL') &&
      (a.deploymentOption === 'Multi-AZ' || a.deploymentOption === 'Multi-AZ deployment') &&
      a.locationType === 'AWS Region'
  );
  if (!sku) return null;
  const price = firstTierPrice(offer, sku);
  if (!price) return null;
  return { monthly: price.perUnit * HOURS_PER_MONTH, detail: `${price.description} × 720 h` };
}

async function ec2Monthly(regionCode: string) {
  const offer = await fetchOfferGuarded(`${PRICING_BASE}/AmazonEC2/current/${regionCode}/index.json`);
  if (!offer) return null;
  const sku = findSku(
    offer,
    (a) =>
      a.instanceType === 't3.large' &&
      a.operatingSystem === 'Linux' &&
      a.capacitystatus === 'used' &&
      a.preInstalledSw === 'NA' &&
      a.tenancy === 'Shared' &&
      a.locationType === 'AWS Region' &&
      (a.licenseModel === 'No License required' || a.operation === 'Linux')
  );
  if (!sku) return null;
  const price = firstTierPrice(offer, sku);
  if (!price) return null;
  return { monthly: price.perUnit * HOURS_PER_MONTH, detail: `${price.description} × 720 h` };
}

function snapshotItem(serviceId: 'ec2' | 'rds') {
  const item = snapshot.items[serviceId];
  if (!item || item.unitMonthly == null) return null;
  return {
    monthly: item.unitMonthly,
    detail: `${item.detail} · ${item.hourly} USD/h × ${HOURS_PER_MONTH} h`
  };
}

function ec2RegionalReference(regionCode: string) {
  const hourly = EC2_T3_LARGE_LINUX_HOURLY_BY_REGION[regionCode];
  if (!hourly) return null;
  const monthly = Math.round(hourly * HOURS_PER_MONTH * 100) / 100;
  return {
    monthly,
    detail: `t3.large Linux on-demand · referencia regional (${regionCode}) · $${hourly} USD/h × ${HOURS_PER_MONTH} h`
  };
}

export default async function handler(req: any, res: any) {
  const allowOrigin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=3600');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const regionCode = String(req.query.region || 'us-east-1');
  const wanted = String(req.query.services || 'ec2,rds,s3,cloudfront,route53,lambda')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const items: Record<string, { unitMonthly: number; detail: string; source: string }> = {};
  const errors: string[] = [];

  const liveFactories: Array<[string, () => Promise<{ monthly: number; detail: string } | null>]> = [
    ['s3', () => s3Monthly(regionCode)],
    ['cloudfront', () => cloudfrontMonthly(regionCode)],
    ['route53', () => route53Monthly(regionCode)],
    ['lambda', () => lambdaMonthly(regionCode)],
    ['rds', () => rdsMonthly(regionCode)],
    ['ec2', () => ec2Monthly(regionCode)]
  ];

  await Promise.all(
    liveFactories.map(async ([serviceId, factory]) => {
      if (!wanted.includes(serviceId)) return;
      try {
        const result = await factory();
        if (result && result.monthly > 0) {
          items[serviceId] = { unitMonthly: Math.round(result.monthly * 100) / 100, detail: result.detail, source: 'live' };
        }
      } catch (error: any) {
        if (serviceId !== 'ec2') errors.push(`${serviceId}: ${error?.message}`);
      }
    })
  );

  for (const serviceId of ['ec2', 'rds']) {
    if (!wanted.includes(serviceId)) continue;
    if (items[serviceId]) continue;
    if (serviceId === 'ec2') {
      const regional = ec2RegionalReference(regionCode);
      if (regional) {
        items.ec2 = {
          unitMonthly: Math.round(regional.monthly * 100) / 100,
          detail: regional.detail,
          source: 'snapshot'
        };
        continue;
      }
    }
    const item = snapshotItem(serviceId as 'ec2' | 'rds');
    if (item) items[serviceId] = { unitMonthly: Math.round(item.monthly * 100) / 100, detail: item.detail, source: 'snapshot' };
  }

  res.status(200).json({
    region: regionCode,
    currency: 'USD',
    fetchedAt: new Date().toISOString(),
    source: 'AWS Price List API (pricing.us-east-1.amazonaws.com)',
    items,
    errors
  });
}