const SOURCE_URL = 'https://status.aws.amazon.com/data.json';

const MONITORED_SERVICES = [
  { serviceId: 'ec2', name: 'Amazon EC2', matchers: ['Amazon Elastic Compute Cloud', 'Amazon EC2'] },
  { serviceId: 'rds', name: 'Amazon RDS', matchers: ['Amazon Relational Database Service'] },
  { serviceId: 'alb', name: 'Elastic Load Balancing', matchers: ['Amazon Elastic Load Balancing'] },
  { serviceId: 'cloudfront', name: 'Amazon CloudFront', matchers: ['Amazon CloudFront'] },
  { serviceId: 'lambda', name: 'AWS Lambda', matchers: ['AWS Lambda'] },
  { serviceId: 'elasticache', name: 'Amazon ElastiCache', matchers: ['Amazon ElastiCache'] },
  { serviceId: 's3', name: 'Amazon Simple Storage Service (S3)', matchers: ['Amazon Simple Storage Service'] }
];

const REGION_NAMES: Record<string, string[]> = {
  'us-east-1': ['US East (N. Virginia)'],
  'us-west-2': ['US West (Oregon)'],
  'eu-west-1': ['EU (Ireland)'],
  'ap-southeast-1': ['Asia Pacific (Singapore)'],
  'sa-east-1': ['South America'],
  'me-central-1': ['UAE'],
  'me-south-1': ['Bahrain']
};

function normalizeRegion(regionName: string): string {
  const flat = (regionName || '').toLowerCase();
  if (flat.includes('us east')) return 'us-east-1';
  if (flat.includes('us west')) return 'us-west-2';
  if (flat.includes('ireland') || flat.includes('eu (west')) return 'eu-west-1';
  if (flat.includes('frankfurt') || flat.includes('eu central')) return 'eu-central-1';
  if (flat.includes('singapore')) return 'ap-southeast-1';
  if (flat.includes('dublin')) return 'eu-west-1';
  if (flat.includes('sao paulo') || flat.includes('south america')) return 'sa-east-1';
  if (flat.includes('bahrain') || flat.includes('middle east')) return 'me-south-1';
  if (flat.includes('uae') || flat.includes('united arab')) return 'me-central-1';
  return 'Global';
}

function matchesService(matchers: string[], serviceName: string): boolean {
  return matchers.some((m) => serviceName.includes(m));
}

export default async function handler(req: any, res: any) {
  const allowOrigin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

try {
    const response = await fetch(SOURCE_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (CloudOpsDashboard; +https://cloudops-dashboard.vercel.app)' }
    });
    if (!response.ok) throw new Error(`AWS Service Health respondió HTTP ${response.status}`);

    const buf = new Uint8Array(await response.arrayBuffer());
    let text: string;
    if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
      text = new TextDecoder('utf-16le').decode(buf.subarray(2));
    } else if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
      text = new TextDecoder('utf-16be').decode(buf.subarray(2));
    } else {
      text = new TextDecoder('utf-8').decode(buf);
      try {
        JSON.parse(text);
      } catch {
        text = new TextDecoder('utf-16le').decode(buf);
      }
    }
    const events = JSON.parse(text);

    const services = MONITORED_SERVICES.map((svc) => {
      const regionStatus: Record<string, string> = {};
      for (const regionCode of Object.keys(REGION_NAMES)) {
        regionStatus[regionCode] = 'online';
      }

      for (const event of events) {
        const changes = event.impacted_service_status_changes;
        for (const impact of changes || []) {
          if (!matchesService(svc.matchers, impact.service_name || '')) continue;
          const regionCode = normalizeRegion(event.region_name || '');
          const current = String(impact.current_status ?? impact.status ?? '');
          if (current === '3') regionStatus[regionCode] = 'problem';
          else if (current === '2' && regionStatus[regionCode] === 'online') regionStatus[regionCode] = 'warning';
          else if (current === '1' && regionStatus[regionCode] === 'online') regionStatus[regionCode] = 'warning';
        }
      }

      return { serviceId: svc.serviceId, name: svc.name, regions: regionStatus };
    });

    const regionStatus: Record<string, string> = {};
    for (const regionCode of Object.keys(REGION_NAMES)) {
      let worst = 'online';
      for (const svc of services) {
        const st = svc.regions[regionCode];
        if (st === 'problem') worst = 'problem';
        else if (st === 'warning' && worst === 'online') worst = 'warning';
      }
      regionStatus[regionCode] = worst;
    }

    const alerts = (events || []).map((event: any, index: number) => {
      const st = String(event.status || '0');
      const impacted = Array.isArray(event.impacted_service_status_changes) ? event.impacted_service_status_changes.length : 0;
      return {
        id: 'health-' + index,
        title: event.service_name || 'AWS Servicio',
        region: event.region_name || 'Global',
        regionCode: normalizeRegion(event.region_name || ''),
        severity: st === '3' ? 'critical' : st === '2' ? 'warning' : 'info',
        message: event.summary || st,
        date: event.date ? new Date(Number(event.date) * 1000).toISOString() : null,
        impacted
      };
    }).filter((a: any) => a.severity !== 'info' || a.impacted > 0);

    res.status(200).json({
      updatedAt: new Date().toISOString(),
      source: 'AWS Service Health Dashboard (status.aws.amazon.com/data.json)',
      services,
      regionStatus,
      alerts
    });
  } catch (error: any) {
    res.status(502).json({ error: 'No se pudo consultar el estado de AWS Service Health', detail: error?.message });
  }
}