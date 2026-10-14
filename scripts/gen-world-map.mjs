import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src', 'data', 'worldPaths.ts');

// Natural Earth 110m Admin 0 - dominio público, sin atribución obligatoria.
// Detalle suficiente para un mapa de continents a escala mundial.
const SOURCE_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';

const WIDTH = 1000;
const HEIGHT = 500;
const PRECISION = 1;

// Países que el mapa debe poder resaltar, junto a las regiones AWS que los usan.
const REQUIRED_IDS = ['USA', 'IRL', 'BRA', 'SGP'];

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  return res.json();
}

const projectX = (lng) => +(((lng + 180) / 360) * WIDTH).toFixed(PRECISION);
const projectY = (lat) => +(((90 - lat) / 180) * HEIGHT).toFixed(PRECISION);

// Natural Earth ya parte la mayoría de anillos en el meridiano 180, pero
// algunos países (Rusia, Fiji) tienen anillos que lo cruzan. Sin este corte,
// el path barre todo el mapa horizontalmente al proyectar en equirectangular.
function splitRingAtAntimeridian(ring) {
  const segments = [];
  let current = [];

  for (const point of ring) {
    if (current.length === 0) {
      current.push(point);
      continue;
    }
    const prev = current[current.length - 1];
    const jumped = Math.abs(point[0] - prev[0]) > 180;
    if (jumped) {
      current.push(point);
      segments.push(current);
      current = [point];
    } else {
      current.push(point);
    }
  }

  if (current.length > 1) segments.push(current);
  return segments.filter((s) => s.length >= 4);
}

function ringToPath(ring) {
  const parts = [];
  for (const point of ring) {
    parts.push(`${projectX(point[0])},${projectY(point[1])}`);
  }
  if (parts.length === 0) return '';
  const first = parts[0];
  const rest = parts.slice(1).join('L');
  return `M${first}L${rest}Z`;
}

function geometryToPath(geometry) {
  if (!geometry) return '';
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const paths = [];

  for (const polygon of polygons || []) {
    // Solo el anillo exterior (índice 0): los anillos internos son lagos/holes
    // que a esta escala no aportan y multiplican el peso del archivo.
    const outer = polygon?.[0];
    if (!Array.isArray(outer)) continue;

    for (const segment of splitRingAtAntimeridian(outer)) {
      const d = ringToPath(segment);
      if (d) paths.push(d);
    }
  }

  return paths.join('');
}

function main() {
  return (async () => {
    console.log(`Descargando Natural Earth 110m countries...`);
    console.log(`  ${SOURCE_URL}`);

    const geo = await get(SOURCE_URL);
    const features = geo?.features || [];
    console.log(`  features recibidas: ${features.length}`);

    const countries = [];
    const seen = new Set();

    for (const feature of features) {
      const id = feature?.properties?.ADM0_A3;
      if (!id || id === '-99') continue;

      const d = geometryToPath(feature.geometry);
      if (!d) continue;

      if (seen.has(id)) {
        //.MultiPolygon partido en varios features: se concatena al mismo id.
        const existing = countries.find((c) => c.id === id);
        if (existing) existing.d += d;
        continue;
      }

      seen.add(id);
      countries.push({ id, d });
    }

    countries.sort((a, b) => a.id.localeCompare(b.id));

    const missing = REQUIRED_IDS.filter((id) => !seen.has(id));

    const header = `// Archivo GENERADO por scripts/gen-world-map.mjs - no editar a mano.
// Fuente: Natural Earth 110m Admin 0 (dominio público), https://www.naturalearthdata.com/
// Proyección equirectangular ${WIDTH}x${HEIGHT}, antimeridiano partido por script.
// ${countries.length} países.

export interface CountryPath {
  id: string;
  d: string;
}

export const WORLD_PATHS: CountryPath[] = [`;

    const body = countries.map((c) => `  { id: '${c.id}', d: '${c.d}' }`).join(',\n');
    const footer = `
];
`;

    fs.writeFileSync(OUT, header + '\n' + body + footer, 'utf8');

    const bytes = fs.statSync(OUT).size;
    console.log(`\nEscrito: ${path.relative(ROOT, OUT)}`);
    console.log(`  países: ${countries.length}`);
    console.log(`  tamaño: ${(bytes / 1024).toFixed(1)} KB`);

    if (missing.length > 0) {
      console.log(`\nAVISO: paises ausentes a escala 110m: ${missing.join(', ')}`);
      console.log(`  (islas pequenas; el marcador de la region se dibuja igual por lat/lng)`);
    } else {
      console.log(`\nTodos los paises requeridos presentes.`);
    }
  })();
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});