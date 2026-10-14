import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src', 'data', 'awsPriceSnapshot.json');
const BASE = 'https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws';
const HOURS_PER_MONTH = 720;

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  return res.json();
}

function onDemandPrice(offer, sku) {
  const od = offer?.terms?.OnDemand?.[sku];
  if (!od) return null;
  for (const termKey of Object.keys(od)) {
    const dims = od[termKey].priceDimensions || {};
    for (const rateKey of Object.keys(dims)) {
      const dim = dims[rateKey];
      const usd = Number(dim.pricePerUnit?.USD);
      if (Number.isFinite(usd) && dim.beginRange === '0') {
        return { hourly: usd, unit: dim.unit, description: dim.description };
      }
    }
  }
  return null;
}

function findCheapest(offer, matches, preferExact = () => true) {
  let best = null;
  let bestExact = null;
  for (const [sku, prod] of Object.entries(offer.products || {})) {
    if (!matches(prod.attributes || {})) continue;
    const price = onDemandPrice(offer, sku);
    if (!price) continue;
    if (preferExact(prod.attributes || {})) {
      if (!bestExact || price.hourly < bestExact.price.hourly) {
        bestExact = { sku, price, attributes: prod.attributes };
      }
    }
    if (!best || price.hourly < best.price.hourly) {
      best = { sku, price, attributes: prod.attributes };
    }
  }
  return bestExact || best;
}

const ec2 = await get(`${BASE}/AmazonEC2/current/us-east-1/index.json`);
const rds = await get(`${BASE}/AmazonRDS/current/us-east-1/index.json`);

const ec2Match = (a) =>
  a.regionCode === 'us-east-1' &&
  a.instanceType === 't3.large' &&
  (a.operatingSystem || '').toLowerCase() === 'linux' &&
  (a.tenancy || '').toLowerCase() === 'shared' &&
  (a.capacitystatus || '').toLowerCase() === 'used' &&
  (a.preInstalledSw || '') === 'NA';

const rdsMatch = (a) =>
  a.regionCode === 'us-east-1' &&
  a.instanceType === 'db.t4g.medium' &&
  (a.databaseEngine || '').toLowerCase() === 'postgresql' &&
  (a.deploymentOption || '').toLowerCase() === 'multi-az';

function toItem(found, label) {
  if (!found) return { unitMonthly: null, detail: label };
  return {
    unitMonthly: Math.round(found.price.hourly * HOURS_PER_MONTH * 100) / 100,
    hourly: Math.round(found.price.hourly * 100000) / 100000,
    sku: found.sku,
    detail: label
  };
}

const snapshot = {
  generatedAt: new Date().toISOString(),
  source: `${BASE}/{OfferCode}/current/us-east-1/index.json`,
  region: 'us-east-1',
  hoursPerMonth: HOURS_PER_MONTH,
  items: {
    ec2: toItem(findCheapest(ec2, ec2Match), 'Amazon EC2 t3.large · Linux · Shared · on-demand (us-east-1)'),
    rds: toItem(findCheapest(rds, rdsMatch), 'Amazon RDS db.t4g.medium · PostgreSQL · Multi-AZ · on-demand (us-east-1)')
  }
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(snapshot, null, 2) + '\n');
console.log('Snapshot escrito en', OUT);
console.log(JSON.stringify(snapshot.items, null, 2));