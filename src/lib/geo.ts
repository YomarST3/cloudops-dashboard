import type { GeoPoint } from '../types/cloud';

export const MAP_WIDTH = 1000;
export const MAP_HEIGHT = 500;

export interface Point {
  x: number;
  y: number;
}

export interface LatencyBand {
  id: 'low' | 'mid' | 'high';
  color: string;
  glow: string;
  strokeWidth: number;
  curvature: number;
  label: string;
}

const BANDS: Record<LatencyBand['id'], LatencyBand> = {
  low: {
    id: 'low',
    color: '#10b981',
    glow: 'rgba(16, 185, 129, 0.35)',
    strokeWidth: 1.5,
    curvature: 0.12,
    label: 'Baja latencia'
  },
  mid: {
    id: 'mid',
    color: '#f59e0b',
    glow: 'rgba(245, 158, 11, 0.35)',
    strokeWidth: 2.5,
    curvature: 0.26,
    label: 'Latencia media'
  },
  high: {
    id: 'high',
    color: '#ef4444',
    glow: 'rgba(239, 68, 68, 0.4)',
    strokeWidth: 3.5,
    curvature: 0.42,
    label: 'Alta latencia'
  }
};

export function projectToXY(point: GeoPoint, width = MAP_WIDTH, height = MAP_HEIGHT): Point {
  const x = ((point.lng + 180) / 360) * width;
  const y = ((90 - point.lat) / 180) * height;
  return {
    x: Math.min(width, Math.max(0, x)),
    y: Math.min(height, Math.max(0, y))
  };
}

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/**
 * Latencia de ida y vuelta estimada a partir de la distancia geodésica.
 *
 * La luz viaja por fibra a ~200.000 km/s y un RTT recorre el camino dos
 * veces, así que el mínimo físico ronda 10 µs por cada 100 km. El tráfico
 * real enruta por cables y centros de intercambio que no siguen la línea recta,
 * además de enrutamiento y conmutación: la experiencia práctica ronda
 * 10x ese mínimo.
 *
 * El factor 100 reproduce los valores del catálogo original (Bogotá →
 * us-east-1 ≈ 3.850 km ≈ 38 ms, Bogotá → ap-southeast-1 ≈ 18.500 km ≈ 185 ms).
 */
export function estimateLatencyMs(from: GeoPoint, to: GeoPoint): number {
  return Math.max(1, Math.round(haversineKm(from, to) / 100));
}

export function latencyBand(latencyMs: number): LatencyBand {
  if (latencyMs < 50) return BANDS.low;
  if (latencyMs <= 120) return BANDS.mid;
  return BANDS.high;
}

export const LATENCY_BANDS: LatencyBand[] = [BANDS.low, BANDS.mid, BANDS.high];

export function latencyToQuality(latencyMs: number): string {
  if (latencyMs < 50) return 'Excelente para workloads interactivos';
  if (latencyMs <= 120) return 'Aceptable para cargas webapis moderadas';
  return 'Alta: conviene colocar CloudFront o PoP de edge delante';
}

export function buildArcPath(from: Point, to: Point, curvature: number): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);

  if (length < 1) return '';

  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;

  const nx = -dy / length;
  const ny = dx / length;

  const lift = length * curvature;
  const controlX = mx + nx * lift;
  const controlY = Math.min(my - Math.abs(ny) * lift, my - lift * 0.85);

  return `M ${from.x.toFixed(2)} ${from.y.toFixed(2)} Q ${controlX.toFixed(2)} ${controlY.toFixed(2)} ${to.x.toFixed(2)} ${to.y.toFixed(2)}`;
}

export function arcMidpoint(from: Point, to: Point, curvature: number): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) return from;

  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const nx = -dy / length;
  const ny = dx / length;
  const lift = length * curvature;

  const controlX = mx + nx * lift;
  const controlY = Math.min(my - Math.abs(ny) * lift, my - lift * 0.85);

  return { x: 0.25 * from.x + 0.5 * controlX + 0.25 * to.x, y: 0.25 * from.y + 0.5 * controlY + 0.25 * to.y };
}

export function arcLength(from: Point, to: Point, curvature: number): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const chord = Math.hypot(dx, dy);
  if (chord < 1) return 0;
  const lift = chord * curvature;
  return Math.round(chord + 4 * lift * 0.55);
}