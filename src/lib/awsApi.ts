import type { ProjectAnalysisResult } from '../types/cloud';

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

/**
 * Convierte la respuesta en JSON, o explica con claridad que fallo.
 *
 * El caso habitual: un host que no ejecuta las funciones de `api/` deja que la
 * regla de fallback de la SPA conteste con index.html y HTTP 200. El codigo ve
 * `ok === true` e intenta parsear HTML, y el navegador lanza un
 * "Unexpected token '<'" que no dice nada util.
 */
async function parseJsonOrThrow<T>(response: Response, url: string): Promise<T> {
  const text = await response.text();

  if (text.trimStart().startsWith('<')) {
    throw new Error(
      `El servidor devolvio una pagina HTML en lugar de datos para ${url}. ` +
        `Las funciones de /api no estan desplegadas en este entorno: solo las ejecuta Vercel. ` +
        `Para servirlas aqui, arranca con "node server.mjs" (npm start).`
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Respuesta no valida de ${url}: ${text.slice(0, 120)}`);
  }
}

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
  const data = await parseJsonOrThrow<T>(response, url);
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
  return parseJsonOrThrow<ProjectAnalysisResult>(response, '/api/ai-analyze');
}

export interface AiReviewResponse {
  aiEnabled: boolean;
  aiModel: string;
  aiFindingCount: number;
  aiError?: string;
  /**
   * El analisis ya combinado (regex + IA). Viene ausente cuando la revision no
   * llego a hacer nada: sin GEMINI_API_KEY el endpoint responde de inmediato
   * para no gastar, y entonces el cliente debe conservar su resultado estatico.
   */
  result?: ProjectAnalysisResult;
}

/**
 * Segunda capa del analizador: revisa el mismo proyecto con Gemini y fusiona sus
 * hallazgos con los del regex. Es un endpoint aparte y mas lento (hasta 60s,
 * una llamada por modulo), asi que el timeout del cliente va holgado.
 */
export async function reviewWithAi(payload: AiAnalyzeRequest): Promise<AiReviewResponse> {
  const response = await fetch('/api/ai-review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(90000),
  });
  if (!response.ok) {
    const err = await response.text().catch(() => `HTTP ${response.status}`);
    throw new Error(err || `HTTP ${response.status}`);
  }
  return parseJsonOrThrow<AiReviewResponse>(response, '/api/ai-review');
}

export interface GitHubFetchFile {
  path: string;
  content: string;
  size: number;
}

export interface GitHubFetchResponse {
  owner?: string;
  repo?: string;
  branch?: string;
  files?: GitHubFetchFile[];
  skipped?: number;
  /** Aviso no fatal (repo sin codigo utilizable). */
  error?: string;
}

/**
 * Descarga un repositorio publico de GitHub. El trabajo pesado (validar la URL,
 * bajar el zipball, filtrar los archivos de codigo) lo hace el servidor; aqui
 * solo se pide y se devuelve su respuesta. El timeout es holgado porque la
 * descarga de un repo puede tardar.
 */
export async function fetchGitHubProject(url: string): Promise<GitHubFetchResponse> {
  const response = await fetch('/api/github-fetch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
    signal: AbortSignal.timeout(60000),
  });
  return parseJsonOrThrow<GitHubFetchResponse>(response, '/api/github-fetch');
}

