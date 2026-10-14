import type { UserOrigin } from '../types/cloud';

export const DEFAULT_ORIGIN: UserOrigin = {
  lat: 4.71,
  lng: -74.07,
  label: 'Bogotá, Colombia',
  source: 'default'
};

/**
 * Capitales de referencia para el mapa. Se agrupan por continente y el
 * desplegable los muestra en ese orden. Bogota va primero porque es el
 * origen por defecto y ancla los valores del catalogo de regiones.
 */
export const ORIGIN_PRESETS: UserOrigin[] = [
  { lat: 4.71, lng: -74.07, label: 'Bogotá, Colombia', source: 'manual', group: 'Sudamérica' },
  { lat: -34.6, lng: -58.38, label: 'Buenos Aires, Argentina', source: 'manual', group: 'Sudamérica' },
  { lat: -23.55, lng: -46.63, label: 'São Paulo, Brasil', source: 'manual', group: 'Sudamérica' },
  { lat: -33.45, lng: -70.67, label: 'Santiago, Chile', source: 'manual', group: 'Sudamérica' },
  { lat: -12.05, lng: -77.04, label: 'Lima, Perú', source: 'manual', group: 'Sudamérica' },
  { lat: 19.43, lng: -99.13, label: 'Ciudad de México, México', source: 'manual', group: 'Norteamérica' },
  { lat: 40.71, lng: -74.01, label: 'Nueva York, EE. UU.', source: 'manual', group: 'Norteamérica' },
  { lat: 37.77, lng: -122.42, label: 'San Francisco, EE. UU.', source: 'manual', group: 'Norteamérica' },
  { lat: 43.65, lng: -79.38, label: 'Toronto, Canadá', source: 'manual', group: 'Norteamérica' },
  { lat: 40.42, lng: -3.7, label: 'Madrid, España', source: 'manual', group: 'Europa' },
  { lat: 51.51, lng: -0.13, label: 'Londres, Reino Unido', source: 'manual', group: 'Europa' },
  { lat: 48.86, lng: 2.35, label: 'París, Francia', source: 'manual', group: 'Europa' },
  { lat: 52.52, lng: 13.4, label: 'Berlín, Alemania', source: 'manual', group: 'Europa' },
  { lat: 52.37, lng: 4.9, label: 'Ámsterdam, Países Bajos', source: 'manual', group: 'Europa' },
  { lat: 38.72, lng: -9.14, label: 'Lisboa, Portugal', source: 'manual', group: 'Europa' },
  { lat: -26.2, lng: 28.05, label: 'Johannesburgo, Sudáfrica', source: 'manual', group: 'África' },
  { lat: 25.2, lng: 55.27, label: 'Dubái, EAU', source: 'manual', group: 'Asia-Pacífico' },
  { lat: 19.08, lng: 72.88, label: 'Bombay, India', source: 'manual', group: 'Asia-Pacífico' },
  { lat: 35.68, lng: 139.69, label: 'Tokio, Japón', source: 'manual', group: 'Asia-Pacífico' },
  { lat: 1.35, lng: 103.82, label: 'Singapur', source: 'manual', group: 'Asia-Pacífico' },
  { lat: -33.87, lng: 151.21, label: 'Sídney, Australia', source: 'manual', group: 'Asia-Pacífico' }
];

export const ORIGIN_STORAGE_KEY = 'cloudops.userOrigin';

export function isValidGeoPoint(value: unknown): value is { lat: number; lng: number } {
  if (!value || typeof value !== 'object') return false;
  const { lat, lng } = value as { lat?: unknown; lng?: unknown };
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export function readStoredOrigin(): UserOrigin | null {
  try {
    const raw = localStorage.getItem(ORIGIN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isValidGeoPoint(parsed)) return null;
    const raw2 = parsed as unknown as Record<string, unknown>;
    return {
      lat: raw2.lat as number,
      lng: raw2.lng as number,
      label: typeof raw2.label === 'string' && raw2.label.trim() ? raw2.label : 'Ubicación guardada',
      source: raw2.source === 'geolocation' ? 'geolocation' : 'manual'
    };
  } catch {
    return null;
  }
}

export function writeStoredOrigin(origin: UserOrigin): void {
  try {
    localStorage.setItem(ORIGIN_STORAGE_KEY, JSON.stringify(origin));
  } catch {
    // Almacenamiento no disponible: el origen queda solo en memoria.
  }
}

export function requestBrowserOrigin(): Promise<UserOrigin> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(DEFAULT_ORIGIN);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          label: 'Tu ubicación',
          source: 'geolocation'
        });
      },
      () => resolve(DEFAULT_ORIGIN),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  });
}