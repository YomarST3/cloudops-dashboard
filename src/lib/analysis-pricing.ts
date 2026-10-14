import type { AwsRecommendedService } from '../types/cloud';

/**
 * Resolucion de precios de los servicios que recomienda el analizador.
 *
 * El analizador devuelve un estimado fijo por servicio, pero el dashboard ya
 * consulta precios reales de AWS para seis servicios (s3, cloudfront, route53,
 * lambda, rds, ec2). Si el PDF y la calculadora de costos resuelven el precio por
 * su cuenta, cada pantalla muestra una cifra distinta.
 *
 * Este modulo es la unica fuente: lo usan el analizador, el PDF y la importacion
 * a Costos, de modo que los tres coinciden por construccion.
 */

export type PriceSource = 'live' | 'estimate';

export interface ResolvedService extends AwsRecommendedService {
  /** Costo mensual unitario efectivo. */
  monthly: number;
  /** De donde salio `monthly`. */
  source: PriceSource;
}

export interface AnalysisPricing {
  services: ResolvedService[];
  totalMonthly: number;
  totalAnnual: number;
  liveCount: number;
  estimateCount: number;
}

/** El analizador redondea a centimos; hacemos lo mismo para que los totales cuadren. */
const cents = (value: number): number => Math.round(value * 100) / 100;

export const resolveAnalysisPricing = (
  services: AwsRecommendedService[],
  awsPrices: Record<string, number>,
  priceSources: Record<string, 'live' | 'snapshot'> = {}
): AnalysisPricing => {
  const resolved = services.map((service) => {
    const live = awsPrices[service.serviceId];

    // Solo contamos como "live" lo que la Price List API confirmo. Un snapshot
    // guardado es una referencia regional, no el precio vigente.
    const isLive = typeof live === 'number' && live > 0 && priceSources[service.serviceId] === 'live';

    return {
      ...service,
      monthly: isLive ? cents(live) : cents(service.estimatedMonthlyCost),
      source: (isLive ? 'live' : 'estimate') as PriceSource,
    } satisfies ResolvedService;
  });

  const totalMonthly = cents(resolved.reduce((acc, s) => acc + s.monthly, 0));
  const liveCount = resolved.filter((s) => s.source === 'live').length;

  return {
    services: resolved,
    totalMonthly,
    totalAnnual: cents(totalMonthly * 12),
    liveCount,
    estimateCount: resolved.length - liveCount,
  };
};

export const EMPTY_PRICING: AnalysisPricing = {
  services: [],
  totalMonthly: 0,
  totalAnnual: 0,
  liveCount: 0,
  estimateCount: 0,
};
