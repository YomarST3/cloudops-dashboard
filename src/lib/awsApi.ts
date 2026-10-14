export interface AwsPriceItem {
  unitMonthly: number;
  detail: string;
  source: 'live' | 'snapshot';
}

export interface AwsPricesResponse {
  region: string;
  currency: 'USD';
  fetchedAt: string;
  source: string;
  items: Record<string, AwsPriceItem>;
  errors?: string[];
}

export interface AwsHealthService {
  serviceId: string;
  name: string;
  regions: Record<string, string>;
}

export interface AwsHealthAlert {
  id: string;
  title: string;
  region: string;
  regionCode: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  date: string | null;
  impacted: number;
}

export interface AwsHealthResponse {
  updatedAt: string;
  source: string;
  services: AwsHealthService[];
  regionStatus: Record<string, string>;
  alerts: AwsHealthAlert[];
}

export interface AwsServiceEntry {
  name: string;
  regions: string[];
  serviceUrl: string;
}

export interface AwsServicesResponse {
  updatedAt: string;
  source: string;
  regionCount: number;
  serviceCount: number;
  region: string | null;
  services: AwsServiceEntry[];
}

export interface AwsIpPrefix {
  prefix: string;
  region: string;
  service: string;
  ipv6: boolean;
}

export interface AwsIpSummaryEntry {
  service: string;
  count: number;
}

export interface AwsIpRangesResponse {
  createDate: string;
  syncToken: string;
  source: string;
  service?: string;
  region?: string | null;
  count?: number;
  prefixes?: AwsIpPrefix[];
  total?: number;
  services?: AwsIpSummaryEntry[];
}

const cache = new Map<string, { expires: number; data: unknown }>();

export async function fetchJson<T>(url: string, cacheTtlMs = 4 * 60 * 1000): Promise<T> {
  const cached = cache.get(url);
  if (cached && cached.expires > Date.now()) return cached.data as T;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = (await response.json()) as T;
  cache.set(url, { expires: Date.now() + cacheTtlMs, data });
  return data;
}

export const getAwsPricing = (region: string) =>
  fetchJson<AwsPricesResponse>(
    `/api/aws-pricing?region=${encodeURIComponent(region)}&services=ec2,rds,s3,cloudfront,route53,lambda`
  );

export const getAwsHealth = () => fetchJson<AwsHealthResponse>('/api/aws-health');

export const getAwsServices = (region?: string) => {
  const query = region ? `?region=${encodeURIComponent(region)}` : '';
  return fetchJson<AwsServicesResponse>(`/api/aws-services${query}`, 15 * 60 * 1000);
};

export const getAwsIpRanges = (service?: string, region?: string) => {
  const params = new URLSearchParams();
  if (service) params.set('service', service);
  if (region) params.set('region', region);
  const query = params.toString();
  return fetchJson<AwsIpRangesResponse>(`/api/aws-ipranges${query ? `?${query}` : ''}`, 15 * 60 * 1000);
};

// ─── AI Project Analyzer ────────────────────────────────────────────────────

export interface AiAnalyzeRequest {
  projectName: string;
  code?: string;
  description?: string;
  language?: string;
  region?: string;
}

export async function analyzeProject(payload: AiAnalyzeRequest) {
  const response = await fetch('/api/ai-analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    const err = await response.text().catch(() => `HTTP ${response.status}`);
    throw new Error(err || `HTTP ${response.status}`);
  }
  return response.json();
}
